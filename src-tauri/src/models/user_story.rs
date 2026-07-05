use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserStory {
    pub id: String,
    pub project_id: String,
    pub epic_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
