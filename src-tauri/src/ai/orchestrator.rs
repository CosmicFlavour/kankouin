use std::sync::Mutex;

use crate::db::AppState;
use crate::error::{AppError, AppResult};

use super::{AIProvider, AIResponse, ChatMessage, ToolContext, ToolDefinition, ToolExecutor};

/// Guards against a misbehaving (or malicious) provider that always
/// requests another tool call — without this, `send_message` would loop
/// forever instead of surfacing an error.
const MAX_ITERATIONS: usize = 5;

/// Owns the conversation history and runs the Prompt -> AI -> Tool Call ->
/// Command Execution -> Result -> AI -> Final Response loop described in
/// the roadmap. A single global conversation for now — no `conversation_id`.
pub struct AIChatOrchestrator {
    history: Mutex<Vec<ChatMessage>>,
}

impl AIChatOrchestrator {
    pub fn new() -> Self {
        Self {
            history: Mutex::new(Vec::new()),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn send_message(
        &self,
        provider: &dyn AIProvider,
        executor: &dyn ToolExecutor,
        tools: &[ToolDefinition],
        ctx: &ToolContext,
        db: &AppState,
        user_message: String,
    ) -> AppResult<String> {
        let mut history = self.history.lock().map_err(|_| AppError::Lock)?;

        history.push(ChatMessage::user(user_message));

        for _ in 0..MAX_ITERATIONS {
            match provider.send(&history, tools)? {
                AIResponse::Message(text) => {
                    history.push(ChatMessage::assistant(text.clone()));
                    return Ok(text);
                }
                AIResponse::ToolCalls(calls) => {
                    // The request that made these calls must appear in
                    // history before their results, or an OpenAI-style API
                    // rejects the next request outright (see ai/mod.rs's
                    // ChatMessage doc comment).
                    history.push(ChatMessage::assistant_tool_calls(calls.clone()));
                    for call in calls {
                        let result = executor.execute(&call, ctx, db)?;
                        history.push(ChatMessage::tool_result(call.id, result.to_string()));
                    }
                }
            }
        }

        Err(AppError::Invalid(
            "ai response loop exceeded max iterations".into(),
        ))
    }
}

impl Default for AIChatOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::mock::{MockAIProvider, MockToolExecutor};
    use crate::ai::{ChatRole, ToolCall};
    use crate::db::{self, DbStatus};
    use serde_json::json;

    fn test_db() -> AppState {
        AppState {
            db: Mutex::new(db::test_connection()),
            db_status: Mutex::new(DbStatus::NotConfigured),
        }
    }

    #[test]
    fn plain_message_round_trip_echoes_and_records_history() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        let reply = orchestrator
            .send_message(&provider, &executor, &[], &ctx, &db, "hello".to_string())
            .unwrap();

        assert_eq!(reply, "Mock echo: hello");
        assert_eq!(orchestrator.history.lock().unwrap().len(), 2);
    }

    #[test]
    fn trigger_tool_message_drives_a_full_tool_call_round_trip() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        let reply = orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "trigger_tool".to_string(),
            )
            .unwrap();

        assert_eq!(reply, "Final response after tool");

        let history = orchestrator.history.lock().unwrap();
        // user message, assistant's tool-call request, tool result, final
        // assistant message
        assert_eq!(history.len(), 4);
        assert_eq!(history[1].role, ChatRole::Assistant);
        assert_eq!(history[1].tool_calls.len(), 1);
        assert_eq!(history[1].tool_calls[0].name, "mock_tool");
        assert_eq!(history[2].role, ChatRole::Tool);
        assert_eq!(history[2].tool_call_id.as_deref(), Some("mock-call-1"));
        assert_eq!(history[2].content, json!({ "ok": true }).to_string());
    }

    struct AlwaysToolCallsProvider;

    impl AIProvider for AlwaysToolCallsProvider {
        fn id(&self) -> &str {
            "always-tool-calls"
        }

        fn send(
            &self,
            _messages: &[ChatMessage],
            _tools: &[ToolDefinition],
        ) -> AppResult<AIResponse> {
            Ok(AIResponse::ToolCalls(vec![ToolCall {
                id: "call".to_string(),
                name: "mock_tool".to_string(),
                arguments: json!({}),
            }]))
        }
    }

    #[test]
    fn provider_that_never_finishes_hits_the_iteration_cap_instead_of_hanging() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = AlwaysToolCallsProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        let err = orchestrator
            .send_message(&provider, &executor, &[], &ctx, &db, "go".to_string())
            .unwrap_err();

        assert!(matches!(err, AppError::Invalid(_)));
    }
}
