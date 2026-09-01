use std::sync::Mutex;

use crate::db::AppState;
use crate::error::{AppError, AppResult};

use super::{
    AIProvider, AIResponse, ChatMessage, ChatTurnResult, ToolContext, ToolDefinition, ToolExecutor,
};

/// Guards against a misbehaving (or malicious) provider that always
/// requests another tool call — without this, `send_message` would loop
/// forever instead of surfacing an error.
const MAX_ITERATIONS: usize = 5;

/// Describes `ctx` in prose for the model, or `None` when there's nothing
/// to say (no project/workspace selected at all). Uses the human-readable
/// name when the frontend supplied one, falling back to the bare id
/// otherwise — either way the model gets *something* concrete to reason
/// about instead of silently guessing at scope.
fn describe_context(ctx: &ToolContext) -> Option<String> {
    let mut parts = Vec::new();
    if ctx.workspace_id.is_some() {
        match &ctx.workspace_name {
            Some(name) => parts.push(format!(
                "workspace '{name}' ({})",
                ctx.workspace_id.as_deref().unwrap()
            )),
            None => parts.push(format!(
                "workspace {}",
                ctx.workspace_id.as_deref().unwrap()
            )),
        }
    }
    if ctx.project_id.is_some() {
        match &ctx.project_name {
            Some(name) => parts.push(format!(
                "project '{name}' ({})",
                ctx.project_id.as_deref().unwrap()
            )),
            None => parts.push(format!("project {}", ctx.project_id.as_deref().unwrap())),
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("Context: {}.", parts.join(", ")))
    }
}

/// Owns the conversation history and runs the Prompt -> AI -> Tool Call ->
/// Command Execution -> Result -> AI -> Final Response loop described in
/// the roadmap. A single global conversation — no `conversation_id` — that
/// persists until `reset` (the "New conversation" button) or an app
/// restart (history is in-memory only, unlike the DB-backed action log
/// tool calls write via `ai_log::record`).
pub struct AIChatOrchestrator {
    history: Mutex<Vec<ChatMessage>>,
    /// Last `(project_id, workspace_id)` the model was told about, so a
    /// context note is injected only when it actually changes — not on
    /// every turn.
    last_context: Mutex<Option<(Option<String>, Option<String>)>>,
}

impl AIChatOrchestrator {
    pub fn new() -> Self {
        Self {
            history: Mutex::new(Vec::new()),
            last_context: Mutex::new(None),
        }
    }

    /// Clears the conversation — the "New conversation" button. Does not
    /// touch the DB-backed action log: past actions stay logged (and
    /// revertible) regardless of whether the transcript that produced them
    /// is still visible.
    pub fn reset(&self) -> AppResult<()> {
        let mut history = self.history.lock().map_err(|_| AppError::Lock)?;
        let mut last_context = self.last_context.lock().map_err(|_| AppError::Lock)?;
        history.clear();
        *last_context = None;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn send_message(
        &self,
        provider: &dyn AIProvider,
        executor: &dyn ToolExecutor,
        tools: &[ToolDefinition],
        ctx: &ToolContext,
        db: &AppState,
        system_prompt: &str,
        user_message: String,
    ) -> AppResult<ChatTurnResult> {
        let mut history = self.history.lock().map_err(|_| AppError::Lock)?;

        // Only at the very start of a conversation — like the context note
        // below, re-injected after `reset` rather than repeated every turn.
        // An empty prompt (tests that don't care about this) injects
        // nothing, same as no context.
        if history.is_empty() && !system_prompt.is_empty() {
            history.push(ChatMessage::system(system_prompt.to_string()));
        }

        let current_context = (ctx.project_id.clone(), ctx.workspace_id.clone());
        {
            let mut last_context = self.last_context.lock().map_err(|_| AppError::Lock)?;
            if last_context.as_ref() != Some(&current_context) {
                if let Some(note) = describe_context(ctx) {
                    history.push(ChatMessage::system(note));
                }
                *last_context = Some(current_context);
            }
        }

        history.push(ChatMessage::user(user_message));

        let mut actions = Vec::new();

        for _ in 0..MAX_ITERATIONS {
            match provider.send(&history, tools)? {
                AIResponse::Message(text) => {
                    history.push(ChatMessage::assistant(text.clone()));
                    return Ok(ChatTurnResult {
                        reply: text,
                        actions,
                    });
                }
                AIResponse::ToolCalls(calls) => {
                    // The request that made these calls must appear in
                    // history before their results, or an OpenAI-style API
                    // rejects the next request outright (see ai/mod.rs's
                    // ChatMessage doc comment).
                    history.push(ChatMessage::assistant_tool_calls(calls.clone()));
                    for call in calls {
                        let result = executor.execute(&call, ctx, db)?;
                        history.push(ChatMessage::tool_result(call.id, result.value.to_string()));
                        if let Some(action) = result.logged_action {
                            actions.push(action);
                        }
                    }
                }
            }
        }

        // Tool calls up to this point already ran against the real DB —
        // this is a "the AI didn't wrap up in time" error, not a "nothing
        // happened" one, and the message says so. The frontend also treats
        // *every* chat_with_ai outcome (success or error) as a reason to
        // refetch, precisely because a failure can still follow committed
        // mutations (see useAIChat.ts). Those actions are still logged in
        // the db even though this error path can't return them inline.
        Err(AppError::Invalid(
            "the AI assistant took too many steps without finishing — actions it already took \
             (if any) were applied; check the board before retrying"
                .into(),
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
    use crate::ai::{ChatRole, ToolCall, ToolExecutionResult};
    use crate::db::{self, DbStatus};
    use crate::models::AiActionLogEntry;
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

        let result = orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "",
                "hello".to_string(),
            )
            .unwrap();

        assert_eq!(result.reply, "Mock echo: hello");
        assert!(result.actions.is_empty());
        assert_eq!(orchestrator.history.lock().unwrap().len(), 2);
    }

    #[test]
    fn trigger_tool_message_drives_a_full_tool_call_round_trip() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        let result = orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "",
                "trigger_tool".to_string(),
            )
            .unwrap();

        assert_eq!(result.reply, "Final response after tool");

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
            .send_message(&provider, &executor, &[], &ctx, &db, "", "go".to_string())
            .unwrap_err();

        assert!(matches!(err, AppError::Invalid(_)));
        // The tool calls that already ran (5 rounds' worth, against the
        // real db) must not be reported as if nothing happened.
        assert!(err.to_string().contains("already took"));
    }

    #[test]
    fn reset_clears_history_so_a_later_switch_still_injects_context() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext {
            project_id: Some("proj-1".into()),
            ..Default::default()
        };
        let db = test_db();

        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "",
                "hello".to_string(),
            )
            .unwrap();
        assert!(!orchestrator.history.lock().unwrap().is_empty());

        orchestrator.reset().unwrap();
        assert!(orchestrator.history.lock().unwrap().is_empty());

        // Same context as before reset — a fresh conversation should
        // re-announce it rather than assuming it's still known.
        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "",
                "hi again".to_string(),
            )
            .unwrap();
        let history = orchestrator.history.lock().unwrap();
        assert_eq!(history[0].role, ChatRole::System);
        assert!(history[0].content.contains("proj-1"));
    }

    #[test]
    fn injects_a_context_message_only_when_project_or_workspace_changes() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let db = test_db();
        let ctx_a = ToolContext {
            project_id: Some("proj-a".into()),
            workspace_id: Some("ws-1".into()),
            project_name: Some("Website Redesign".into()),
            workspace_name: Some("Personal".into()),
        };

        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx_a,
                &db,
                "",
                "first".to_string(),
            )
            .unwrap();
        {
            let history = orchestrator.history.lock().unwrap();
            // system context note, then the user message
            assert_eq!(history.len(), 3);
            assert_eq!(history[0].role, ChatRole::System);
            assert!(history[0].content.contains("Website Redesign"));
            assert!(history[0].content.contains("Personal"));
        }

        // Same context again — no repeat system message, just the new
        // exchange appended.
        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx_a,
                &db,
                "",
                "second".to_string(),
            )
            .unwrap();
        {
            let history = orchestrator.history.lock().unwrap();
            assert_eq!(history.len(), 5);
            assert_ne!(history[3].role, ChatRole::System);
        }

        // Switching project mid-conversation injects a new note.
        let ctx_b = ToolContext {
            project_id: Some("proj-b".into()),
            ..ctx_a.clone()
        };
        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx_b,
                &db,
                "",
                "third".to_string(),
            )
            .unwrap();
        let history = orchestrator.history.lock().unwrap();
        assert_eq!(history.len(), 8);
        assert_eq!(history[5].role, ChatRole::System);
        assert!(history[5].content.contains("proj-b"));
    }

    #[test]
    fn no_context_message_is_injected_when_nothing_is_selected() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "",
                "hello".to_string(),
            )
            .unwrap();

        let history = orchestrator.history.lock().unwrap();
        assert_eq!(history.len(), 2);
        assert!(history.iter().all(|m| m.role != ChatRole::System));
    }

    #[test]
    fn injects_the_system_prompt_once_at_the_start_of_the_conversation() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "You are a helpful board assistant.",
                "hello".to_string(),
            )
            .unwrap();
        {
            let history = orchestrator.history.lock().unwrap();
            assert_eq!(history.len(), 3);
            assert_eq!(history[0].role, ChatRole::System);
            assert_eq!(history[0].content, "You are a helpful board assistant.");
        }

        // A later turn in the same conversation doesn't repeat it.
        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "You are a helpful board assistant.",
                "again".to_string(),
            )
            .unwrap();
        let history = orchestrator.history.lock().unwrap();
        assert_eq!(
            history
                .iter()
                .filter(|m| m.role == ChatRole::System)
                .count(),
            1
        );
    }

    #[test]
    fn re_injects_the_system_prompt_after_reset() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = MockToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "be nice",
                "hi".to_string(),
            )
            .unwrap();
        orchestrator.reset().unwrap();
        orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "be nice",
                "hi again".to_string(),
            )
            .unwrap();

        let history = orchestrator.history.lock().unwrap();
        assert_eq!(history[0].role, ChatRole::System);
        assert_eq!(history[0].content, "be nice");
    }

    struct LoggingToolExecutor;

    impl ToolExecutor for LoggingToolExecutor {
        fn execute(
            &self,
            call: &ToolCall,
            _ctx: &ToolContext,
            _db: &AppState,
        ) -> AppResult<ToolExecutionResult> {
            Ok(ToolExecutionResult {
                value: json!({ "ok": true }),
                logged_action: Some(AiActionLogEntry {
                    id: "log-1".into(),
                    tool_name: call.name.clone(),
                    summary: "Archived \"Test\"".into(),
                    task_id: Some("task-1".into()),
                    revertible: true,
                    reverted_at: None,
                    created_at: "2024-01-01T00:00:00Z".into(),
                }),
            })
        }
    }

    #[test]
    fn collects_logged_actions_across_the_whole_turn() {
        let orchestrator = AIChatOrchestrator::new();
        let provider = MockAIProvider;
        let executor = LoggingToolExecutor;
        let ctx = ToolContext::default();
        let db = test_db();

        let result = orchestrator
            .send_message(
                &provider,
                &executor,
                &[],
                &ctx,
                &db,
                "",
                "trigger_tool".to_string(),
            )
            .unwrap();

        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].summary, "Archived \"Test\"");
    }
}
