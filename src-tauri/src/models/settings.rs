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
    /// The AI assistant's backend connection, if configured. Stored in
    /// plain text like `db_file_path` — no encryption, a deliberate choice
    /// (unlike `CloudSync.passphrase`, which is deliberately never round-
    /// tripped back to the frontend).
    pub ai_connection: Option<AIConnection>,
    /// User override for the AI assistant's system prompt. Deliberately a
    /// sibling of `ai_connection`, not a field on it — it's a behavior
    /// setting, not transport config, so clearing or reconfiguring the
    /// connection must not lose it. `None` means "use whichever built-in
    /// default ships with the running app version" (see
    /// `ai::DEFAULT_SYSTEM_PROMPT` / `ai::effective_system_prompt`) — that's
    /// how a user who never customizes it gets prompt improvements for
    /// free on every update, with no migration required.
    pub ai_system_prompt: Option<String>,
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

/// Default per-request timeout for talking to the AI backend, used both as
/// the settings UI's starting value and as the fallback for `ai_connection`
/// entries saved before `timeout_seconds` existed (via `#[serde(default)]`
/// below) — old settings.json files must keep deserializing rather than
/// losing every other setting because of one new required field.
pub const DEFAULT_AI_TIMEOUT_SECS: u64 = 120;

fn default_ai_timeout_secs() -> u64 {
    DEFAULT_AI_TIMEOUT_SECS
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AIConnection {
    /// Which `ai::AIProvider` to use, e.g. "openwebui". Only one is
    /// supported today (see `ai::resolve_provider`) but this leaves room
    /// for more without changing the storage shape.
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    /// How long a single request to the AI backend may take before giving
    /// up (see `ai::openwebui::OpenWebUIProvider`) — without this, a
    /// stalled backend hangs a chat turn indefinitely.
    #[serde(default = "default_ai_timeout_secs")]
    pub timeout_seconds: u64,
    /// Optional path to a PEM file with extra CA certificate(s) to trust
    /// when verifying the backend's TLS cert — e.g. a corporate root CA on
    /// an internal network whose certs aren't in the default webpki roots.
    /// The file's certs are added *on top of* those roots, never replacing
    /// them. `None` (and what old settings.json files deserialize to via
    /// `#[serde(default)]`) means "trust only the usual roots".
    #[serde(default)]
    pub ca_certificate_path: Option<String>,
}
