use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMeta {
    pub device_id: String,
    pub last_synced_at: Option<String>,
}
