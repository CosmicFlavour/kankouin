use std::path::Path;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

use crate::cloud::{self, oauth, CloudProvider, CloudStatus, ProviderInfo};
use crate::commands::settings;
use crate::commands::sync::{encrypt_db_to_bytes, import_bytes_swapping_connection, touch_synced};
use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::CloudSync;

fn status_from(cloud_sync: Option<CloudSync>) -> CloudStatus {
    match cloud_sync {
        None => CloudStatus::NotConnected,
        Some(cs) => CloudStatus::Connected {
            provider: cs.provider,
            account_label: cs.account_label,
            has_passphrase: cs.passphrase.is_some(),
        },
    }
}

fn require_cloud_sync(config_dir: &Path) -> AppResult<CloudSync> {
    settings::read(config_dir)
        .cloud_sync
        .ok_or_else(|| AppError::Invalid("no cloud storage connected".into()))
}

/// Encrypts the live db, uploads it via `provider`, and persists the
/// resulting `remote_file_ref` — the pure core of `push_to_cloud`, taking a
/// `Connection`/`Path`/`&dyn CloudProvider` directly so it's testable
/// against a fake in-memory provider instead of the real network.
fn push(
    conn: &Connection,
    config_dir: &Path,
    cloud_sync: CloudSync,
    provider: &dyn CloudProvider,
) -> AppResult<()> {
    let passphrase = cloud_sync.passphrase.clone().ok_or_else(|| {
        AppError::Invalid("no encryption passphrase set for this cloud storage yet".into())
    })?;
    let access_token = oauth::refresh_access_token(
        provider.token_url(),
        provider.client_id(),
        &cloud_sync.refresh_token,
    )?;

    let container = encrypt_db_to_bytes(conn, &passphrase)?;
    let new_remote_ref = provider.upload(
        &access_token,
        cloud_sync.remote_file_ref.as_deref(),
        &container,
    )?;
    touch_synced(conn)?;

    settings::save_cloud_sync(
        config_dir,
        CloudSync {
            remote_file_ref: Some(new_remote_ref),
            ..cloud_sync
        },
    )?;
    Ok(())
}

/// Downloads the remote backup via `provider` and swaps it into `conn` —
/// the pure core of `pull_from_cloud`.
fn pull(
    conn: &mut Connection,
    cloud_sync: &CloudSync,
    provider: &dyn CloudProvider,
) -> AppResult<()> {
    let passphrase = cloud_sync.passphrase.as_deref().ok_or_else(|| {
        AppError::Invalid("no encryption passphrase set for this cloud storage yet".into())
    })?;
    let remote_ref = cloud_sync.remote_file_ref.as_deref().ok_or_else(|| {
        AppError::Invalid("nothing has been pushed to this cloud storage yet".into())
    })?;
    let access_token = oauth::refresh_access_token(
        provider.token_url(),
        provider.client_id(),
        &cloud_sync.refresh_token,
    )?;

    let container = provider.download(&access_token, remote_ref)?;
    import_bytes_swapping_connection(conn, passphrase, &container)
}

#[tauri::command]
pub fn list_cloud_providers() -> Vec<ProviderInfo> {
    cloud::list_provider_info()
}

#[tauri::command]
pub fn get_cloud_status(app: AppHandle) -> AppResult<CloudStatus> {
    let config_dir = app.path().app_config_dir()?;
    Ok(status_from(settings::read(&config_dir).cloud_sync))
}

/// Runs the connect flow for `provider_id` end to end (opens the browser,
/// blocks on the loopback redirect, exchanges tokens) and persists the
/// result. See `cloud::oauth::run_connect_flow` for the flow itself — every
/// provider goes through the same code here. No passphrase yet at this
/// point — `set_cloud_passphrase` is a separate step.
#[tauri::command]
pub fn start_cloud_connect(app: AppHandle, provider_id: String) -> AppResult<CloudStatus> {
    let provider = cloud::provider_by_id(&provider_id)?;
    let result = oauth::run_connect_flow(&app, provider.as_ref())?;

    let cloud_sync = CloudSync {
        provider: provider_id.clone(),
        account_label: result.account_label.clone(),
        refresh_token: result.refresh_token,
        remote_file_ref: None,
        passphrase: None,
    };
    let config_dir = app.path().app_config_dir()?;
    settings::save_cloud_sync(&config_dir, cloud_sync)?;

    Ok(CloudStatus::Connected {
        provider: provider_id,
        account_label: result.account_label,
        has_passphrase: false,
    })
}

#[tauri::command]
pub fn disconnect_cloud(app: AppHandle) -> AppResult<CloudStatus> {
    let config_dir = app.path().app_config_dir()?;
    settings::clear_cloud_sync(&config_dir)?;
    Ok(CloudStatus::NotConnected)
}

/// Sets (or replaces) the cached push/pull passphrase. Written only —
/// nothing ever reads it back out to the frontend; `get_cloud_status`
/// reports `has_passphrase` instead of the value itself.
#[tauri::command]
pub fn set_cloud_passphrase(app: AppHandle, passphrase: String) -> AppResult<CloudStatus> {
    let config_dir = app.path().app_config_dir()?;
    let cloud_sync = require_cloud_sync(&config_dir)?;
    let updated = settings::save_cloud_sync(
        &config_dir,
        CloudSync {
            passphrase: Some(passphrase),
            ..cloud_sync
        },
    )?;
    Ok(status_from(updated.cloud_sync))
}

#[tauri::command]
pub fn push_to_cloud(app: AppHandle, state: State<AppState>) -> AppResult<()> {
    let config_dir = app.path().app_config_dir()?;
    let cloud_sync = require_cloud_sync(&config_dir)?;
    let provider = cloud::provider_by_id(&cloud_sync.provider)?;
    let conn = state.conn()?;
    push(&conn, &config_dir, cloud_sync, provider.as_ref())
}

#[tauri::command]
pub fn pull_from_cloud(app: AppHandle, state: State<AppState>) -> AppResult<()> {
    let config_dir = app.path().app_config_dir()?;
    let cloud_sync = require_cloud_sync(&config_dir)?;
    let provider = cloud::provider_by_id(&cloud_sync.provider)?;
    let mut conn = state.conn()?;
    pull(&mut conn, &cloud_sync, provider.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::sync::Mutex;

    /// An in-memory CloudProvider double: "uploads" just overwrite a byte
    /// buffer, "downloads" read it back. No network, no real provider
    /// needed — exercises the same push/pull orchestration any real
    /// provider would go through.
    struct FakeProvider {
        stored: Mutex<Option<Vec<u8>>>,
    }

    impl FakeProvider {
        fn new() -> Self {
            Self {
                stored: Mutex::new(None),
            }
        }
    }

    impl CloudProvider for FakeProvider {
        fn id(&self) -> &str {
            "fake"
        }
        fn display_name(&self) -> &str {
            "Fake"
        }
        fn authorize_url(
            &self,
            _state: &str,
            _code_challenge: &str,
            _redirect_uri: &str,
        ) -> String {
            unreachable!("push/pull tests don't run the connect flow")
        }
        fn token_url(&self) -> &str {
            unreachable!("refresh_access_token is exercised in cloud::oauth's own tests")
        }
        fn client_id(&self) -> &str {
            "fake-client-id"
        }
        fn scopes(&self) -> &str {
            ""
        }
        fn upload(
            &self,
            _access_token: &str,
            _remote_ref: Option<&str>,
            bytes: &[u8],
        ) -> AppResult<String> {
            *self.stored.lock().unwrap() = Some(bytes.to_vec());
            Ok("fake-remote-ref".to_string())
        }
        fn download(&self, _access_token: &str, _remote_ref: &str) -> AppResult<Vec<u8>> {
            self.stored
                .lock()
                .unwrap()
                .clone()
                .ok_or_else(|| AppError::Invalid("nothing uploaded yet".into()))
        }
        fn account_label(&self, _access_token: &str) -> AppResult<Option<String>> {
            Ok(Some("fake@example.com".into()))
        }
    }

    /// `push`/`pull` both call `oauth::refresh_access_token`, which makes a
    /// real HTTP call to `token_url()` — point it at a throwaway local
    /// server that always answers with a fixed access token, so these
    /// tests never touch the network.
    fn fake_token_server() -> String {
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            // Both push and pull each call refresh_access_token once, so
            // this needs to answer more than a single request.
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                loop {
                    line.clear();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                        break;
                    }
                }
                let body = r#"{"access_token":"fake-access-token"}"#;
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        format!("http://{addr}")
    }

    struct FakeProviderWithTokenUrl {
        inner: FakeProvider,
        token_url: String,
    }

    impl CloudProvider for FakeProviderWithTokenUrl {
        fn id(&self) -> &str {
            self.inner.id()
        }
        fn display_name(&self) -> &str {
            self.inner.display_name()
        }
        fn authorize_url(&self, s: &str, c: &str, r: &str) -> String {
            self.inner.authorize_url(s, c, r)
        }
        fn token_url(&self) -> &str {
            &self.token_url
        }
        fn client_id(&self) -> &str {
            self.inner.client_id()
        }
        fn scopes(&self) -> &str {
            self.inner.scopes()
        }
        fn upload(&self, t: &str, r: Option<&str>, b: &[u8]) -> AppResult<String> {
            self.inner.upload(t, r, b)
        }
        fn download(&self, t: &str, r: &str) -> AppResult<Vec<u8>> {
            self.inner.download(t, r)
        }
        fn account_label(&self, t: &str) -> AppResult<Option<String>> {
            self.inner.account_label(t)
        }
    }

    fn test_cloud_sync() -> CloudSync {
        CloudSync {
            provider: "fake".into(),
            account_label: Some("fake@example.com".into()),
            refresh_token: "refresh-token".into(),
            remote_file_ref: None,
            passphrase: Some("correct horse".into()),
        }
    }

    #[test]
    fn push_then_pull_round_trips_the_encrypted_db() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        let config_dir = dir.path().join("config");
        let conn = db::open_and_migrate(&db_path).unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, name, created_at, updated_at) \
             VALUES ('ws1', 'Personal', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();

        let provider = FakeProviderWithTokenUrl {
            inner: FakeProvider::new(),
            token_url: fake_token_server(),
        };

        push(&conn, &config_dir, test_cloud_sync(), &provider).unwrap();
        drop(conn);

        // Pull into a fresh, empty database file.
        let target_path = dir.path().join("target.sqlite3");
        let mut target_conn = db::open_and_migrate(&target_path).unwrap();
        let mut cloud_sync = test_cloud_sync();
        cloud_sync.remote_file_ref = Some("fake-remote-ref".into());

        pull(&mut target_conn, &cloud_sync, &provider).unwrap();

        let name: String = target_conn
            .query_row("SELECT name FROM workspaces WHERE id = 'ws1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "Personal");
    }

    #[test]
    fn push_persists_the_remote_ref_returned_by_the_provider() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        let config_dir = dir.path().join("config");
        let conn = db::open_and_migrate(&db_path).unwrap();
        let provider = FakeProviderWithTokenUrl {
            inner: FakeProvider::new(),
            token_url: fake_token_server(),
        };

        push(&conn, &config_dir, test_cloud_sync(), &provider).unwrap();

        let settings = settings::read(&config_dir);
        assert_eq!(
            settings.cloud_sync.unwrap().remote_file_ref.as_deref(),
            Some("fake-remote-ref")
        );
    }

    #[test]
    fn push_without_a_passphrase_set_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        let config_dir = dir.path().join("config");
        let conn = db::open_and_migrate(&db_path).unwrap();
        let provider = FakeProvider::new();
        let mut cloud_sync = test_cloud_sync();
        cloud_sync.passphrase = None;

        let result = push(&conn, &config_dir, cloud_sync, &provider);

        assert!(matches!(result, Err(AppError::Invalid(_))));
    }

    #[test]
    fn pull_without_a_prior_push_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        let mut conn = db::open_and_migrate(&db_path).unwrap();
        let provider = FakeProvider::new();

        let result = pull(&mut conn, &test_cloud_sync(), &provider);

        assert!(matches!(result, Err(AppError::Invalid(_))));
    }

    #[test]
    fn pull_without_a_passphrase_set_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        let mut conn = db::open_and_migrate(&db_path).unwrap();
        let provider = FakeProvider::new();
        let mut cloud_sync = test_cloud_sync();
        cloud_sync.passphrase = None;
        cloud_sync.remote_file_ref = Some("fake-remote-ref".into());

        let result = pull(&mut conn, &cloud_sync, &provider);

        assert!(matches!(result, Err(AppError::Invalid(_))));
    }

    #[test]
    fn wrong_passphrase_on_pull_leaves_local_data_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        let config_dir = dir.path().join("config");
        let conn = db::open_and_migrate(&db_path).unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, name, created_at, updated_at) \
             VALUES ('ws1', 'Personal', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        let provider = FakeProviderWithTokenUrl {
            inner: FakeProvider::new(),
            token_url: fake_token_server(),
        };
        push(&conn, &config_dir, test_cloud_sync(), &provider).unwrap();

        let mut cloud_sync = test_cloud_sync();
        cloud_sync.remote_file_ref = Some("fake-remote-ref".into());
        cloud_sync.passphrase = Some("wrong passphrase".into());
        let mut conn = conn;
        let result = pull(&mut conn, &cloud_sync, &provider);

        assert!(result.is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn status_from_reports_not_connected_and_connected_with_passphrase_presence() {
        assert_eq!(status_from(None), CloudStatus::NotConnected);
        assert_eq!(
            status_from(Some(test_cloud_sync())),
            CloudStatus::Connected {
                provider: "fake".into(),
                account_label: Some("fake@example.com".into()),
                has_passphrase: true,
            }
        );

        let mut without_passphrase = test_cloud_sync();
        without_passphrase.passphrase = None;
        assert_eq!(
            status_from(Some(without_passphrase)),
            CloudStatus::Connected {
                provider: "fake".into(),
                account_label: Some("fake@example.com".into()),
                has_passphrase: false,
            }
        );
    }
}
