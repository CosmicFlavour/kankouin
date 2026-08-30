pub mod mock;
pub mod openwebui;
pub mod orchestrator;
pub mod registry;

use serde::{Deserialize, Serialize};

use crate::db::AppState;
use crate::error::AppResult;
use crate::models::Settings;

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
    /// Set only on an `Assistant` message that requested tool calls — OpenAI-
    /// style APIs require this echoed back verbatim (id/name/arguments)
    /// alongside the `Tool` result messages that follow, or they reject the
    /// next request outright.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    /// Set only on a `Tool` message: which tool call this is the result of.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::User,
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: None,
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::Assistant,
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: None,
        }
    }

    pub fn assistant_tool_calls(calls: Vec<ToolCall>) -> Self {
        Self {
            role: ChatRole::Assistant,
            content: String::new(),
            tool_calls: calls,
            tool_call_id: None,
        }
    }

    pub fn tool_result(call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::Tool,
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: Some(call_id.into()),
        }
    }
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
/// AIProvider` in `ai::orchestrator` — swapping providers (mock, OpenWebUI,
/// ...) means implementing this trait, nothing else changes. Mirrors
/// `cloud::CloudProvider`.
pub trait AIProvider: Send + Sync {
    fn id(&self) -> &str;

    /// Blocking by design, like the rest of this codebase's I/O (see
    /// `cloud::CloudProvider`, which uses blocking `ureq`) — no async
    /// runtime is pulled into the project for this.
    fn send(&self, messages: &[ChatMessage], tools: &[ToolDefinition]) -> AppResult<AIResponse>;
}

/// Picks the provider to use for a single `chat_with_ai` call based on the
/// currently saved settings — resolved fresh per call (like every other
/// settings-backed command reads `settings::read` fresh, no caching) so a
/// newly saved connection takes effect immediately, no app restart needed.
/// Falls back to the mock provider when nothing is configured yet, so the
/// app stays usable out of the box.
pub fn resolve_provider(settings: &Settings) -> Box<dyn AIProvider> {
    match &settings.ai_connection {
        Some(conn) if conn.provider == "openwebui" => Box::new(openwebui::OpenWebUIProvider::new(
            conn.base_url.clone(),
            conn.api_key.clone(),
            conn.model.clone(),
            std::time::Duration::from_secs(conn.timeout_seconds),
        )),
        _ => Box::new(mock::MockAIProvider),
    }
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
/// `db::AppState` since it holds no DB connection. Holds no provider — that
/// depends on user-configurable settings and is resolved fresh per call by
/// `resolve_provider` instead (see its doc comment).
pub struct AiState {
    pub orchestrator: orchestrator::AIChatOrchestrator,
    pub executor: Box<dyn ToolExecutor>,
}

impl AiState {
    pub fn new() -> Self {
        Self {
            orchestrator: orchestrator::AIChatOrchestrator::new(),
            executor: Box::new(registry::CommandToolExecutor),
        }
    }
}

impl Default for AiState {
    fn default() -> Self {
        Self::new()
    }
}
