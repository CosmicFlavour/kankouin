use std::fs;
use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{CloudSync, Settings};

const FILE_NAME: &str = "settings.json";
const VALID_THEMES: [&str; 2] = ["light", "dark"];

/// Reads `settings.json` from `config_dir`. A missing file (first run) or a
/// corrupted one both fall back to defaults rather than erroring — this is
/// convenience data, not user content, so it should never block the app.
pub fn read(config_dir: &Path) -> Settings {
    fs::read_to_string(config_dir.join(FILE_NAME))
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

/// Writes `settings` to `config_dir` via a staging file + rename, so a crash
/// mid-write can't leave `settings.json` truncated or corrupted.
fn write(config_dir: &Path, settings: &Settings) -> AppResult<()> {
    fs::create_dir_all(config_dir)?;

    let staging_path = config_dir.join(format!("{FILE_NAME}.tmp"));
    let json =
        serde_json::to_string_pretty(settings).expect("Settings serialization is infallible");
    fs::write(&staging_path, json)?;
    fs::rename(&staging_path, config_dir.join(FILE_NAME))?;
    Ok(())
}

// All save_* helpers read the existing file first and only overwrite their
// own field, so setting one field doesn't clobber the others — Settings has
// more than one field now.

pub fn save_db_file_path(config_dir: &Path, path: String) -> AppResult<Settings> {
    let mut settings = read(config_dir);
    settings.db_file_path = Some(path);
    write(config_dir, &settings)?;
    Ok(settings)
}

fn save_last_sync_file_path(config_dir: &Path, path: String) -> AppResult<Settings> {
    let mut settings = read(config_dir);
    settings.last_sync_file_path = Some(path);
    write(config_dir, &settings)?;
    Ok(settings)
}

pub fn save_cloud_sync(config_dir: &Path, cloud_sync: CloudSync) -> AppResult<Settings> {
    let mut settings = read(config_dir);
    settings.cloud_sync = Some(cloud_sync);
    write(config_dir, &settings)?;
    Ok(settings)
}

pub fn clear_cloud_sync(config_dir: &Path) -> AppResult<Settings> {
    let mut settings = read(config_dir);
    settings.cloud_sync = None;
    write(config_dir, &settings)?;
    Ok(settings)
}

fn save_theme(config_dir: &Path, theme: String) -> AppResult<Settings> {
    if !VALID_THEMES.contains(&theme.as_str()) {
        return Err(AppError::Invalid(format!(
            "invalid theme {theme:?}, expected one of {VALID_THEMES:?}"
        )));
    }
    let mut settings = read(config_dir);
    settings.theme = Some(theme);
    write(config_dir, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppResult<Settings> {
    let config_dir = app.path().app_config_dir()?;
    Ok(read(&config_dir))
}

#[tauri::command]
pub fn set_last_sync_file_path(app: AppHandle, path: String) -> AppResult<Settings> {
    let config_dir = app.path().app_config_dir()?;
    save_last_sync_file_path(&config_dir, path)
}

#[tauri::command]
pub fn set_theme(app: AppHandle, theme: String) -> AppResult<Settings> {
    let config_dir = app.path().app_config_dir()?;
    save_theme(&config_dir, theme)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_returns_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let settings = read(dir.path());
        assert_eq!(settings.last_sync_file_path, None);
    }

    #[test]
    fn corrupted_file_returns_defaults() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(FILE_NAME), b"not valid json").unwrap();
        let settings = read(dir.path());
        assert_eq!(settings.last_sync_file_path, None);
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let written =
            save_last_sync_file_path(dir.path(), "/home/user/Dropbox/kankouin.enc".into()).unwrap();
        assert_eq!(
            written.last_sync_file_path.as_deref(),
            Some("/home/user/Dropbox/kankouin.enc")
        );

        let read_back = read(dir.path());
        assert_eq!(
            read_back.last_sync_file_path.as_deref(),
            Some("/home/user/Dropbox/kankouin.enc")
        );
    }

    #[test]
    fn second_write_overwrites_the_first() {
        let dir = tempfile::tempdir().unwrap();
        save_last_sync_file_path(dir.path(), "/first/path.enc".into()).unwrap();
        save_last_sync_file_path(dir.path(), "/second/path.enc".into()).unwrap();

        let settings = read(dir.path());
        assert_eq!(
            settings.last_sync_file_path.as_deref(),
            Some("/second/path.enc")
        );
    }

    #[test]
    fn db_file_path_round_trips_and_does_not_clobber_sync_path() {
        let dir = tempfile::tempdir().unwrap();
        save_last_sync_file_path(dir.path(), "/some/sync.enc".into()).unwrap();
        let written = save_db_file_path(dir.path(), "/home/user/kankouin.sqlite3".into()).unwrap();

        assert_eq!(
            written.db_file_path.as_deref(),
            Some("/home/user/kankouin.sqlite3")
        );
        assert_eq!(
            written.last_sync_file_path.as_deref(),
            Some("/some/sync.enc")
        );

        let read_back = read(dir.path());
        assert_eq!(
            read_back.db_file_path.as_deref(),
            Some("/home/user/kankouin.sqlite3")
        );
    }

    #[test]
    fn cloud_sync_round_trips_and_can_be_cleared() {
        let dir = tempfile::tempdir().unwrap();
        let cloud_sync = CloudSync {
            provider: "dropbox".into(),
            account_label: Some("me@example.com".into()),
            refresh_token: "refresh-token-value".into(),
            remote_file_ref: Some("/kankouin/backup.enc".into()),
            passphrase: Some("hunter2".into()),
        };

        let written = save_cloud_sync(dir.path(), cloud_sync.clone()).unwrap();
        assert_eq!(written.cloud_sync, Some(cloud_sync.clone()));

        let read_back = read(dir.path());
        assert_eq!(read_back.cloud_sync, Some(cloud_sync));

        let cleared = clear_cloud_sync(dir.path()).unwrap();
        assert_eq!(cleared.cloud_sync, None);
        assert_eq!(read(dir.path()).cloud_sync, None);
    }

    #[test]
    fn theme_and_sync_path_do_not_clobber_each_other() {
        let dir = tempfile::tempdir().unwrap();
        save_last_sync_file_path(dir.path(), "/some/path.enc".into()).unwrap();
        save_theme(dir.path(), "dark".into()).unwrap();

        let settings = read(dir.path());
        assert_eq!(
            settings.last_sync_file_path.as_deref(),
            Some("/some/path.enc")
        );
        assert_eq!(settings.theme.as_deref(), Some("dark"));

        save_last_sync_file_path(dir.path(), "/other/path.enc".into()).unwrap();
        let settings = read(dir.path());
        assert_eq!(settings.theme.as_deref(), Some("dark"));
    }

    #[test]
    fn invalid_theme_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let result = save_theme(dir.path(), "purple".into());
        assert!(matches!(result, Err(AppError::Invalid(_))));
    }

    #[test]
    fn write_leaves_no_staging_file_behind() {
        let dir = tempfile::tempdir().unwrap();
        save_last_sync_file_path(dir.path(), "/some/path.enc".into()).unwrap();
        assert!(!dir.path().join(format!("{FILE_NAME}.tmp")).exists());
    }
}
