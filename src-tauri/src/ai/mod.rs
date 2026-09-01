pub mod mock;
pub mod openwebui;
pub mod orchestrator;
pub mod registry;
pub mod subtask_breakdown;

use serde::{Deserialize, Serialize};

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{AiActionLogEntry, Settings};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatRole {
    User,
    Assistant,
    Tool,
    /// Injected by the orchestrator (never by a human or the AI) to tell
    /// the model when the frontend's project/workspace context changes
    /// mid-conversation — see `orchestrator::send_message`.
    System,
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

    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::System,
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: None,
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

/// The built-in system prompt, used whenever `Settings::ai_system_prompt`
/// is `None` — i.e. for every user who hasn't customized it, on every app
/// version. Changing this text is how the default improves over time
/// without a settings migration; see `Settings::ai_system_prompt`'s doc
/// comment for why a customized prompt intentionally does *not* pick up
/// later edits to this constant.
pub const DEFAULT_SYSTEM_PROMPT: &str = "\
You are the AI assistant embedded in Kankouin, a task management app.

Kankouin's data model: workspaces contain projects; projects contain epics \
and user stories, which group tasks; tasks can have subtasks, tags, and a \
deadline (an exact date or a fuzzy bucket like \"this week\"). Tasks move \
through columns: todo, doing, under_review, done.

You act on the user's board through tools, not by describing what to \
click. Guidelines:

- Look before you leap: use the list/get tools to resolve names to ids and \
confirm state before mutating anything you're not already certain about. \
Never guess an id.
- Prefer the smallest set of tool calls that accomplishes the request.
- If a request is ambiguous or destructive (e.g. archiving many tasks, \
overwriting a filled-in field) and there's more than one reasonable \
reading, ask a brief clarifying question instead of guessing.
- Every tool call you make is logged and revertible by the user, so it's \
fine to act on clear, unambiguous instructions without asking for \
confirmation first.
- After acting, tell the user concisely what changed — don't narrate your \
reasoning or restate the tool calls verbatim.
- Keep replies short: you're in a narrow chat sidebar, not a document.
- If the user hasn't selected a project or workspace and the request needs \
one, ask which one instead of assuming.";

/// Resolves the prompt to actually send: the user's override if they've
/// set one, otherwise the current built-in default.
pub fn effective_system_prompt(settings: &Settings) -> &str {
    settings
        .ai_system_prompt
        .as_deref()
        .unwrap_or(DEFAULT_SYSTEM_PROMPT)
}

/// Picks the provider to use for a single `chat_with_ai` call based on the
/// currently saved settings — resolved fresh per call (like every other
/// settings-backed command reads `settings::read` fresh, no caching) so a
/// newly saved connection takes effect immediately, no app restart needed.
/// Falls back to the mock provider when nothing is configured yet, so the
/// app stays usable out of the box. Can fail when an OpenWebUI connection
/// configures a CA certificate file that can't be read or parsed (see
/// `openwebui::build_agent`) — better to error at chat time with the exact
/// problem than to retry TLS with default roots.
pub fn resolve_provider(settings: &Settings) -> AppResult<Box<dyn AIProvider>> {
    match &settings.ai_connection {
        Some(conn) if conn.provider == "openwebui" => {
            Ok(Box::new(openwebui::OpenWebUIProvider::new(
                conn.base_url.clone(),
                conn.api_key.clone(),
                conn.model.clone(),
                std::time::Duration::from_secs(conn.timeout_seconds),
                conn.ca_certificate_path.clone(),
            )?))
        }
        _ => Ok(Box::new(mock::MockAIProvider)),
    }
}

/// Frontend-supplied context (e.g. the project currently open in the UI).
/// `project_id`/`workspace_id` get injected into a tool call's arguments
/// automatically when the AI omits them (see `registry::merge_context`) —
/// so it doesn't need to be told, or guess, `project_id` for a request
/// that's implicitly "in the task the user is looking at". `project_name`/
/// `workspace_name` are display-only, used solely by
/// `orchestrator::send_message` to tell the model in prose when this
/// context changes mid-conversation — never used for tool-argument
/// injection.
#[derive(Debug, Clone, Default)]
pub struct ToolContext {
    pub project_id: Option<String>,
    pub workspace_id: Option<String>,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
}

/// What executing a single tool call produced: the value fed back to the
/// AI as the tool result, plus (for mutating tools) the audit-log entry
/// `ai_log::record` wrote for it — `None` for read-only tools, which
/// aren't logged at all (the trail is about what changed, not what was
/// queried).
#[derive(Debug)]
pub struct ToolExecutionResult {
    pub value: serde_json::Value,
    pub logged_action: Option<AiActionLogEntry>,
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
    ) -> AppResult<ToolExecutionResult>;
}

/// What a full `chat_with_ai` turn produced: the AI's final reply, plus
/// every mutating tool call it made along the way (possibly across
/// several rounds of tool calls within the turn — see
/// `MAX_TOOL_LOOP_ITERATIONS`), so the frontend can show an inline
/// "N actions taken" trail under the reply.
#[derive(Debug, Clone, Serialize)]
pub struct ChatTurnResult {
    pub reply: String,
    pub actions: Vec<AiActionLogEntry>,
}

/// Guards against a misbehaving (or malicious) provider that always
/// requests another tool call — without this, `run_tool_loop` would loop
/// forever instead of surfacing an error.
const MAX_TOOL_LOOP_ITERATIONS: usize = 5;

/// Drives `history` through provider ⇄ tool-call round trips until the
/// provider returns a plain message, appending everything (tool-call
/// requests, tool results, the final reply) to `history` as it goes.
/// Shared by `orchestrator::send_message` (a long-lived conversation
/// history, persisted across turns in a `Mutex`) and
/// `subtask_breakdown::break_into_subtasks` (a throwaway history built
/// fresh for one unsupervised action) — both just assemble a starting
/// `history` differently and hand it to this same loop.
pub(crate) fn run_tool_loop(
    provider: &dyn AIProvider,
    executor: &dyn ToolExecutor,
    tools: &[ToolDefinition],
    ctx: &ToolContext,
    db: &AppState,
    history: &mut Vec<ChatMessage>,
) -> AppResult<ChatTurnResult> {
    let mut actions = Vec::new();

    for _ in 0..MAX_TOOL_LOOP_ITERATIONS {
        match provider.send(history.as_slice(), tools)? {
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
                // rejects the next request outright (see ChatMessage's
                // doc comment above).
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

    // Tool calls up to this point already ran against the real DB — this
    // is a "didn't wrap up in time" error, not a "nothing happened" one,
    // and the message says so.
    Err(AppError::Invalid(
        "the AI took too many steps without finishing — actions it already took (if any) \
         were applied; check the board before retrying"
            .into(),
    ))
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
