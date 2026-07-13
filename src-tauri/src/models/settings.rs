use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    /// Path to the live, working SQLite file the app reads/writes directly.
    pub db_file_path: Option<String>,
    /// Target of the manual encrypted export/import file picker. Distinct
    /// from `cloud_sync`, which is the one-click online-storage connection.
    pub last_sync_file_path: Option<String>,
    pub theme: Option<String>,
    /// The single active cloud storage connection, if any. Reconnecting to
    /// a different provider replaces this wholesale rather than keeping
    /// multiple connections around at once.
    pub cloud_sync: Option<CloudSync>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CloudSync {
    /// Matches a `CloudProvider::id()`, e.g. "dropbox".
    pub provider: String,
    /// Cosmetic only (e.g. account email), shown in the UI.
    pub account_label: Option<String>,
    pub refresh_token: String,
    /// Dropbox: a fixed path. Drive (later): a file id, absent until the
    /// first successful push.
    pub remote_file_ref: Option<String>,
    /// Cached so push/pull are genuinely one-click — set once via
    /// `set_cloud_passphrase`, read only by push/pull, never sent back to
    /// the frontend (`CloudStatus` only reports whether one is set).
    pub passphrase: Option<String>,
}
