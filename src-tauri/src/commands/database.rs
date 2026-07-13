use std::path::Path;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

use crate::commands::settings;
use crate::db::{self, AppState, DbStatus};
use crate::error::{AppError, AppResult};

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Opens `path` as the new live db and, only once that succeeds, swaps it
/// into `conn` and records it in `config_dir`'s settings. If opening (or
/// saving settings) fails, `conn` is left exactly as it was — a failed
/// switch must never cost the user whatever db (or lack of one) they
/// already had loaded.
fn switch_to(
    conn: &mut Connection,
    config_dir: &Path,
    path: &Path,
    create: bool,
) -> AppResult<DbStatus> {
    if create && path.exists() {
        return Err(AppError::Invalid(format!(
            "a file already exists at {} — use \"open\" instead if you want to use it",
            path.display()
        )));
    }
    if !create && !path.exists() {
        return Err(AppError::Invalid(format!(
            "no file found at {}",
            path.display()
        )));
    }

    let new_conn = db::open_and_migrate(path)?;
    let path_str = path_string(path);
    settings::save_db_file_path(config_dir, path_str.clone())?;

    *conn = new_conn;
    Ok(DbStatus::Ok { path: path_str })
}

#[tauri::command]
pub fn create_database_file(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> AppResult<DbStatus> {
    let config_dir = app.path().app_config_dir()?;
    let mut conn = state.conn()?;
    let status = switch_to(&mut conn, &config_dir, Path::new(&path), true)?;
    drop(conn);
    state.set_status(status.clone())?;
    Ok(status)
}

#[tauri::command]
pub fn open_database_file(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> AppResult<DbStatus> {
    let config_dir = app.path().app_config_dir()?;
    let mut conn = state.conn()?;
    let status = switch_to(&mut conn, &config_dir, Path::new(&path), false)?;
    drop(conn);
    state.set_status(status.clone())?;
    Ok(status)
}

#[tauri::command]
pub fn get_database_status(state: State<AppState>) -> AppResult<DbStatus> {
    state.status()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn switch_to_create_opens_fresh_file_and_saves_path() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("data").join("kankouin.sqlite3");
        let config_dir = dir.path().join("config");
        let mut conn = Connection::open_in_memory().unwrap();

        let status = switch_to(&mut conn, &config_dir, &db_path, true).unwrap();

        assert_eq!(
            status,
            DbStatus::Ok {
                path: path_string(&db_path)
            }
        );
        assert!(db_path.exists());
        let settings = settings::read(&config_dir);
        assert_eq!(
            settings.db_file_path.as_deref(),
            Some(path_string(&db_path).as_str())
        );
        // The connection passed in was actually swapped, not left pointing
        // at the old (in-memory) one.
        assert_eq!(conn.path(), Some(path_string(&db_path)).as_deref());
    }

    #[test]
    fn switch_to_create_rejects_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        db::open_and_migrate(&db_path).unwrap();
        let mut conn = Connection::open_in_memory().unwrap();

        let result = switch_to(&mut conn, dir.path(), &db_path, true);

        assert!(matches!(result, Err(AppError::Invalid(_))));
        // Rejected before touching the passed-in connection.
        assert_eq!(conn.path(), Some(""));
    }

    #[test]
    fn switch_to_open_rejects_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("does-not-exist.sqlite3");
        let mut conn = Connection::open_in_memory().unwrap();

        let result = switch_to(&mut conn, dir.path(), &db_path, false);

        assert!(matches!(result, Err(AppError::Invalid(_))));
    }

    #[test]
    fn switch_to_open_loads_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kankouin.sqlite3");
        db::open_and_migrate(&db_path).unwrap();
        let mut conn = Connection::open_in_memory().unwrap();

        let status = switch_to(&mut conn, dir.path(), &db_path, false).unwrap();

        assert_eq!(
            status,
            DbStatus::Ok {
                path: path_string(&db_path)
            }
        );
    }

    #[test]
    fn failed_switch_leaves_existing_connection_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let good_db = dir.path().join("good.sqlite3");
        let mut conn = db::open_and_migrate(&good_db).unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, name, created_at, updated_at) \
             VALUES ('ws1', 'Personal', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();

        // Opening a nonexistent file must fail without disturbing `conn`.
        let missing = dir.path().join("missing.sqlite3");
        let result = switch_to(&mut conn, dir.path(), &missing, false);
        assert!(result.is_err());

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
