use serde::{Deserialize, Serialize};

/// A logged AI tool call, as returned to the frontend. Deliberately
/// smaller than the DB row: `arguments`/`before_state` are internal-only
/// (raw tool-call JSON has no business in the chat UI), and `created_at`
/// isn't needed since a turn's actions are already returned in call order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiActionLogEntry {
    pub id: String,
    pub tool_name: String,
    pub summary: String,
    pub task_id: Option<String>,
    pub revertible: bool,
    pub reverted_at: Option<String>,
}
