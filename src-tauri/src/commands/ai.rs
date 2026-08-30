use tauri::{AppHandle, Manager, State};

use crate::ai::{self, registry, AiState, ToolContext};
use crate::commands::settings;
use crate::db::AppState;
use crate::error::AppResult;

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
