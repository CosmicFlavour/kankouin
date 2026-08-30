use tauri::{AppHandle, Manager, State};

use crate::ai::{self, openwebui, registry, AiState, ToolContext};
use crate::commands::settings;
use crate::db::AppState;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub fn chat_with_ai(
    app: AppHandle,
    db: State<AppState>,
    ai_state: State<AiState>,
    message: String,
    project_id: Option<String>,
    workspace_id: Option<String>,
) -> AppResult<String> {
    let config_dir = app.path().app_config_dir()?;
    let provider = ai::resolve_provider(&settings::read(&config_dir));
    let ctx = ToolContext {
        project_id,
        workspace_id,
    };
    ai_state.orchestrator.send_message(
        provider.as_ref(),
        ai_state.executor.as_ref(),
        &registry::toolbox(),
        &ctx,
        db.inner(),
        message,
    )
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
    )
}
