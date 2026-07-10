use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    pub last_sync_file_path: Option<String>,
    pub theme: Option<String>,
}
