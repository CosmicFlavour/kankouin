use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    /// Path to the live, working SQLite file the app reads/writes directly.
    /// Distinct from `last_sync_file_path`, which is the target of the
    /// encrypted export/import used for cloud sync.
    pub db_file_path: Option<String>,
    pub last_sync_file_path: Option<String>,
    pub theme: Option<String>,
}
