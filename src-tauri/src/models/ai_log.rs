use serde::{Deserialize, Serialize};

/// A logged AI tool call, as returned to the frontend. Deliberately
/// smaller than the DB row: `arguments`/`before_state` are internal-only —
/// raw tool-call JSON has no business in the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiActionLogEntry {
    pub id: String,
    pub tool_name: String,
    pub summary: String,
    pub task_id: Option<String>,
    pub revertible: bool,
    pub reverted_at: Option<String>,
    /// RFC3339. Unused by a single turn's actions (already in call order),
    /// but needed to order the standalone Actions tab's `list_ai_actions`
    /// query, which spans every conversation, not just the current one.
    pub created_at: String,
}
