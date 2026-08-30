use serde_json::json;

use crate::db::AppState;
use crate::error::{AppError, AppResult};

use super::{
    AIProvider, AIResponse, ChatMessage, ChatRole, ToolCall, ToolContext, ToolDefinition,
    ToolExecutor,
};

/// Deterministic stand-in for a real AI backend, driven entirely by the
/// last message in the conversation so behavior is easy to assert on in
/// tests: a `"trigger_tool"` user message requests `mock_tool`, a tool
/// result message gets a canned final answer, and anything else is echoed
/// back — proving the orchestrator's full loop without a network call.
pub struct MockAIProvider;

impl AIProvider for MockAIProvider {
    fn id(&self) -> &str {
        "mock"
    }

    fn send(&self, messages: &[ChatMessage], _tools: &[ToolDefinition]) -> AppResult<AIResponse> {
        let last = messages
            .last()
            .ok_or_else(|| AppError::Invalid("no messages to respond to".into()))?;

        match last.role {
            ChatRole::Tool => Ok(AIResponse::Message("Final response after tool".to_string())),
            ChatRole::User if last.content == "trigger_tool" => {
                Ok(AIResponse::ToolCalls(vec![ToolCall {
                    id: "mock-call-1".to_string(),
                    name: "mock_tool".to_string(),
                    arguments: json!({}),
                }]))
            }
            _ => Ok(AIResponse::Message(format!("Mock echo: {}", last.content))),
        }
    }
}

/// Executes the single tool `MockAIProvider` knows how to request. Stands
/// in for the Phase 2 tool registry.
pub struct MockToolExecutor;

impl ToolExecutor for MockToolExecutor {
    fn execute(
        &self,
        call: &ToolCall,
        _ctx: &ToolContext,
        _db: &AppState,
    ) -> AppResult<serde_json::Value> {
        match call.name.as_str() {
            "mock_tool" => Ok(json!({ "ok": true })),
            other => Err(AppError::Invalid(format!("unknown tool {other:?}"))),
        }
    }
}
