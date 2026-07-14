use serde::{Deserialize, Serialize};

use crate::models::tag::Tag;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub epic_id: Option<String>,
    pub user_story_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub priority: String,
    pub deadline_type: Option<String>,
    pub exact_date: Option<String>,
    pub fuzzy_bucket: Option<String>,
    pub bucket_period: Option<String>,
    pub state_since: String,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Board/list-view shape: a `Task` plus its tags and whether it's currently
/// blocked by an incomplete dependency, joined in bulk by the caller to
/// avoid N+1 queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSummary {
    #[serde(flatten)]
    pub task: Task,
    pub tags: Vec<Tag>,
    pub blocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub done: bool,
    pub sort_order: i64,
    pub created_at: String,
}

/// `get_task`'s return shape: everything the task detail panel needs in one
/// call (subtasks + tags + the tasks this one is blocked by).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDetail {
    pub task: Task,
    pub subtasks: Vec<Subtask>,
    pub tags: Vec<Tag>,
    pub blocked_by: Vec<Task>,
}
