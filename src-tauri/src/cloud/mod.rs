pub mod dropbox;
pub mod oauth;

use serde::Serialize;

use crate::error::{AppError, AppResult};

/// Everything that differs between cloud storage backends. Connecting,
/// pushing and pulling are all written once against `&dyn CloudProvider` in
/// `commands::cloud_sync` and `cloud::oauth` — adding a new provider means
/// implementing this trait and adding it to `available_providers`, nothing
/// else changes.
pub trait CloudProvider: Send + Sync {
    /// Stable identifier stored in `Settings::cloud_sync.provider` — never
    /// shown to the user, never changed once shipped.
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;

    fn authorize_url(&self, state: &str, code_challenge: &str, redirect_uri: &str) -> String;
    fn token_url(&self) -> &str;
    fn client_id(&self) -> &str;
    fn scopes(&self) -> &str;

    /// Uploads `bytes` as the encrypted backup container. `remote_ref` is
    /// `None` on the very first push (nothing uploaded yet) and `Some` on
    /// every push after — providers that need to distinguish create vs.
    /// update (e.g. Drive's file-id model) use that; providers with a fixed
    /// path (e.g. Dropbox) can ignore it. Returns the `remote_ref` to
    /// persist for next time (unchanged for fixed-path providers).
    fn upload(
        &self,
        access_token: &str,
        remote_ref: Option<&str>,
        bytes: &[u8],
    ) -> AppResult<String>;

    fn download(&self, access_token: &str, remote_ref: &str) -> AppResult<Vec<u8>>;

    /// Best-effort account label (e.g. email) for display only. `Ok(None)`
    /// if the provider doesn't expose one cheaply; failures here shouldn't
    /// block connecting.
    fn account_label(&self, access_token: &str) -> AppResult<Option<String>>;
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub display_name: String,
}

/// All providers the app knows about, in the order they should be offered
/// in the UI. Adding a provider is exactly one line here.
pub fn available_providers() -> Vec<Box<dyn CloudProvider>> {
    vec![Box::new(dropbox::Dropbox)]
}

pub fn list_provider_info() -> Vec<ProviderInfo> {
    available_providers()
        .iter()
        .map(|p| ProviderInfo {
            id: p.id().to_string(),
            display_name: p.display_name().to_string(),
        })
        .collect()
}

pub fn provider_by_id(id: &str) -> AppResult<Box<dyn CloudProvider>> {
    available_providers()
        .into_iter()
        .find(|p| p.id() == id)
        .ok_or_else(|| AppError::Invalid(format!("unknown cloud provider {id:?}")))
}

/// Formats a ureq error for display, including the response body when
/// there is one. That's where providers put their actual explanation for
/// an HTTP error (e.g. Dropbox's `error_summary`) — ureq's own `Display`
/// for `Error::Status` only shows the status code, not the body, so
/// without this every failed request just says "status code 400" with no
/// way to tell why.
pub(crate) fn describe_ureq_error(err: ureq::Error) -> String {
    match err {
        ureq::Error::Status(code, response) => {
            let body = response
                .into_string()
                .unwrap_or_else(|_| "<unreadable response body>".into());
            format!("HTTP {code}: {body}")
        }
        ureq::Error::Transport(transport) => transport.to_string(),
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CloudStatus {
    NotConnected,
    Connected {
        provider: String,
        account_label: Option<String>,
        /// Whether a push/pull passphrase is cached — never the passphrase
        /// itself, which is written but never read back by the frontend.
        has_passphrase: bool,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dropbox_is_listed_and_resolvable_by_id() {
        let providers = list_provider_info();
        assert!(providers.iter().any(|p| p.id == "dropbox"));

        let provider = provider_by_id("dropbox").unwrap();
        assert_eq!(provider.id(), "dropbox");
    }

    #[test]
    fn unknown_provider_id_is_rejected() {
        let result = provider_by_id("not_a_real_provider");
        assert!(matches!(result, Err(AppError::Invalid(_))));
    }
}
