use std::fs;
use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::Settings;

const FILE_NAME: &str = "settings.json";
const VALID_THEMES: [&str; 2] = ["light", "dark"];

/// Reads `settings.json` from `config_dir`. A missing file (first run) or a
/// corrupted one both fall back to defaults rather than erroring — this is
/// convenience data, not user content, so it should never block the app.
fn read(config_dir: &Path) -> Settings {
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

// Both save_* helpers read the existing file first and only overwrite their
// own field, so setting the theme doesn't clobber the sync file path (and
// vice versa) — Settings has more than one field now.

fn save_last_sync_file_path(config_dir: &Path, path: String) -> AppResult<Settings> {
    let mut settings = read(config_dir);
    settings.last_sync_file_path = Some(path);
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
