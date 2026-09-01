use tauri::{AppHandle, Manager, State};

use crate::ai::{self, openwebui, registry, AiState, ToolContext};
use crate::commands::settings;
use crate::db::AppState;
use crate::error::{AppError, AppResult};

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn chat_with_ai(
    app: AppHandle,
    db: State<AppState>,
    ai_state: State<AiState>,
    message: String,
    project_id: Option<String>,
    workspace_id: Option<String>,
    project_name: Option<String>,
    workspace_name: Option<String>,
) -> AppResult<ai::ChatTurnResult> {
    let config_dir = app.path().app_config_dir()?;
    let settings = settings::read(&config_dir);
    let provider = ai::resolve_provider(&settings)?;
    let system_prompt = ai::effective_system_prompt(&settings);
    let ctx = ToolContext {
        project_id,
        workspace_id,
        project_name,
        workspace_name,
    };
    ai_state.orchestrator.send_message(
        provider.as_ref(),
        ai_state.executor.as_ref(),
        &registry::toolbox(),
        &ctx,
        db.inner(),
        system_prompt,
        message,
    )
}

/// The task panel's "Break into subtasks" button — a one-shot AI action
/// scoped to a single task and a single tool, entirely separate from the
/// conversational assistant (see `ai::subtask_breakdown` for the actual
/// prompt/restriction logic).
#[tauri::command]
pub fn break_task_into_subtasks(
    app: AppHandle,
    db: State<AppState>,
    ai_state: State<AiState>,
    task_id: String,
) -> AppResult<ai::ChatTurnResult> {
    let config_dir = app.path().app_config_dir()?;
    let settings = settings::read(&config_dir);
    let provider = ai::resolve_provider(&settings)?;
    ai::subtask_breakdown::break_into_subtasks(
        provider.as_ref(),
        ai_state.executor.as_ref(),
        db.inner(),
        task_id,
    )
}

/// The built-in default system prompt, for the settings UI to show as
/// reference/placeholder text next to the user's override field — kept as
/// a separate command rather than a `Settings` field so it's never
/// accidentally persisted into `settings.json` (see
/// `Settings::ai_system_prompt`'s doc comment).
#[tauri::command]
pub fn get_default_ai_system_prompt() -> &'static str {
    ai::DEFAULT_SYSTEM_PROMPT
}

/// The "New conversation" button — clears the in-memory transcript. Does
/// not touch the DB-backed action log (see `AIChatOrchestrator::reset`).
#[tauri::command]
pub fn reset_ai_conversation(ai_state: State<AiState>) -> AppResult<()> {
    ai_state.orchestrator.reset()
}

/// Probes a connection's reachability/auth before it's saved — draft
/// (not-yet-saved) values from the settings dialog, so this takes them
/// directly rather than reading `Settings::ai_connection`.
#[tauri::command]
pub fn test_ai_connection(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    timeout_seconds: u64,
    ca_certificate_path: Option<String>,
) -> AppResult<openwebui::ConnectionTestResult> {
    if provider != "openwebui" {
        return Err(AppError::Invalid(format!(
            "unsupported AI provider {provider:?}"
        )));
    }
    openwebui::test_connection(
        &base_url,
        &api_key,
        &model,
        std::time::Duration::from_secs(timeout_seconds),
        ca_certificate_path.as_deref(),
    )
}
