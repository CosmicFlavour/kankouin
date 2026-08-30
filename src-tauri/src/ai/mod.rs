pub mod mock;
pub mod orchestrator;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatRole {
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

/// JSON-schema description of a callable tool. Unused (callers pass an
/// empty slice) until the Phase 2 tool registry populates it from the real
/// toolbox — the shape is defined now so `AIProvider::send` doesn't need to
/// change signature when that lands.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AIResponse {
    Message(String),
    ToolCalls(Vec<ToolCall>),
}

/// Everything that differs between AI backends. Written once against `&dyn
/// AIProvider` in `ai::orchestrator` — swapping the mock for a real backend
/// (e.g. the company's AI API) means implementing this trait, nothing else
/// changes. Mirrors `cloud::CloudProvider`.
pub trait AIProvider: Send + Sync {
    fn id(&self) -> &str;

    /// Blocking by design, like the rest of this codebase's I/O (see
    /// `cloud::CloudProvider`, which uses blocking `ureq`) — no async
    /// runtime is pulled into the project for this.
    fn send(&self, messages: &[ChatMessage], tools: &[ToolDefinition]) -> AppResult<AIResponse>;
}

/// Executes a single tool call and returns its result. Stands in for the
/// Phase 2 `ToolRegistry`, which will map calls onto real Tauri commands
/// (`create_task`, `add_subtask`, etc.) instead of the mock's canned tool.
pub trait ToolExecutor: Send + Sync {
    fn execute(&self, call: &ToolCall) -> AppResult<serde_json::Value>;
}

/// Managed Tauri state for the AI chat feature. Kept separate from
/// `db::AppState` since it holds no DB connection.
pub struct AiState {
    pub orchestrator: orchestrator::AIChatOrchestrator,
    pub provider: Box<dyn AIProvider>,
    pub executor: Box<dyn ToolExecutor>,
}

impl AiState {
    pub fn new() -> Self {
        Self {
            orchestrator: orchestrator::AIChatOrchestrator::new(),
            provider: Box::new(mock::MockAIProvider),
            executor: Box::new(mock::MockToolExecutor),
        }
    }
}

impl Default for AiState {
    fn default() -> Self {
        Self::new()
    }
}
