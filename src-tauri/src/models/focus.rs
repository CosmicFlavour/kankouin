use serde::Serialize;

use crate::models::Task;

/// The task currently "in focus" plus when focus started — see
/// `commands::focus` for how it's set/cleared/auto-cleared. At most one
/// exists at a time; it's a passive reminder the user sets on themselves,
/// not a restriction on what else they can do.
#[derive(Debug, Clone, Serialize)]
pub struct FocusSession {
    pub task: Task,
    pub started_at: String,
}
