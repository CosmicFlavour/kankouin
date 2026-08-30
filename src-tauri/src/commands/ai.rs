use tauri::State;

use crate::ai::AiState;
use crate::error::AppResult;

#[tauri::command]
pub fn chat_with_ai(state: State<AiState>, message: String) -> AppResult<String> {
    state.orchestrator.send_message(
        state.provider.as_ref(),
        state.executor.as_ref(),
        &[],
        message,
    )
}
