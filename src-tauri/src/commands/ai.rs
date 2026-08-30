use tauri::State;

use crate::ai::{registry, AiState, ToolContext};
use crate::db::AppState;
use crate::error::AppResult;

#[tauri::command]
pub fn chat_with_ai(
    db: State<AppState>,
    ai: State<AiState>,
    message: String,
    project_id: Option<String>,
    workspace_id: Option<String>,
) -> AppResult<String> {
    let ctx = ToolContext {
        project_id,
        workspace_id,
    };
    ai.orchestrator.send_message(
        ai.provider.as_ref(),
        ai.executor.as_ref(),
        &registry::toolbox(),
        &ctx,
        db.inner(),
        message,
    )
}
