pub mod mock;
pub mod orchestrator;
pub mod registry;

use serde::{Deserialize, Serialize};

use crate::db::AppState;
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

/// JSON-schema description of a callable tool, as understood by
/// `AIProvider::send` and populated for real by `registry::toolbox`.
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

/// Frontend-supplied context (e.g. the project currently open in the UI)
/// that gets injected into a tool call's arguments automatically when the
/// AI omits them — so it doesn't need to be told, or guess, `project_id`
/// for a request that's implicitly "in the task the user is looking at".
#[derive(Debug, Clone, Default)]
pub struct ToolContext {
    pub project_id: Option<String>,
    pub workspace_id: Option<String>,
}

/// Executes a single tool call and returns its result. `registry` is the
/// real implementation, mapping calls onto the same command functions
/// `src-tauri/src/commands` exposes over Tauri's IPC; `mock` is a canned
/// stand-in used to test the orchestrator loop in isolation.
pub trait ToolExecutor: Send + Sync {
    fn execute(
        &self,
        call: &ToolCall,
        ctx: &ToolContext,
        db: &AppState,
    ) -> AppResult<serde_json::Value>;
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
            executor: Box::new(registry::CommandToolExecutor),
        }
    }
}

impl Default for AiState {
    fn default() -> Self {
        Self::new()
    }
}
