use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

use crate::commands::settings;
use crate::error::{AppError, AppResult};

/// Where the live db currently stands, as reported to the frontend so it can
/// gate rendering (and explain *why*) when there's no usable connection yet.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DbStatus {
    Ok { path: String },
    NotConfigured,
    Missing { path: String },
    Error { path: String, message: String },
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_status: Mutex<DbStatus>,
}

impl AppState {
    /// Locks the DB connection, turning a poisoned mutex into an `AppError`
    /// instead of panicking (a panic while a command holds this lock would
    /// otherwise take down every subsequent command).
    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db.lock().map_err(|_| AppError::Lock)
    }

    pub fn status(&self) -> AppResult<DbStatus> {
        self.db_status
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| AppError::Lock)
    }

    pub fn set_status(&self, status: DbStatus) -> AppResult<()> {
        let mut guard = self.db_status.lock().map_err(|_| AppError::Lock)?;
        *guard = status;
        Ok(())
    }
}

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(include_str!("../../migrations/0001_init.sql"))])
}

/// Opens (creating if needed) a SQLite file at `path`, sets the same pragmas
/// and migrations as the real app database. Used both by startup resolution
/// and by integration tests that need a real on-disk file (e.g. for
/// `commands::sync`, which encrypts the raw db file bytes and can't work
/// against an in-memory connection).
pub fn open_and_migrate(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut conn = Connection::open(path)?;

    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    migrations().to_latest(&mut conn)?;

    Ok(conn)
}

/// A connection to hold in `AppState` when there's no real db loaded yet
/// (fresh install, or the configured path is missing/broken). Never queried
/// for app data — the frontend gates on `DbStatus` before rendering anything
/// that would touch it.
pub fn placeholder_connection() -> Connection {
    Connection::open_in_memory().expect("failed to open in-memory placeholder database")
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Resolves which db file to load at startup from `db_file_path` in
/// settings — `NotConfigured` if nothing's been set up yet.
///
/// Never fails outright on a bad/missing file — that's reported as
/// `DbStatus::Missing`/`Error` so the frontend can offer to create or open
/// a different one, rather than the app refusing to start.
pub fn resolve_startup_db(app_handle: &AppHandle) -> AppResult<(Connection, DbStatus)> {
    let config_dir = app_handle.path().app_config_dir()?;
    resolve_db_from_config_dir(&config_dir)
}

/// Path-based core of `resolve_startup_db`, split out so it's testable
/// without a running Tauri app (which `AppHandle` requires).
fn resolve_db_from_config_dir(config_dir: &Path) -> AppResult<(Connection, DbStatus)> {
    let settings = settings::read(config_dir);
    let path = settings.db_file_path.map(PathBuf::from);

    let Some(path) = path else {
        return Ok((placeholder_connection(), DbStatus::NotConfigured));
    };

    if !path.exists() {
        return Ok((
            placeholder_connection(),
            DbStatus::Missing {
                path: path_string(&path),
            },
        ));
    }

    match open_and_migrate(&path) {
        Ok(conn) => Ok((
            conn,
            DbStatus::Ok {
                path: path_string(&path),
            },
        )),
        Err(err) => Ok((
            placeholder_connection(),
            DbStatus::Error {
                path: path_string(&path),
                message: err.to_string(),
            },
        )),
    }
}

#[cfg(test)]
pub fn test_connection() -> Connection {
    let mut conn = Connection::open_in_memory().expect("failed to open in-memory database");
    conn.pragma_update(None, "foreign_keys", "ON")
        .expect("failed to enable foreign keys");
    migrations()
        .to_latest(&mut conn)
        .expect("failed to run database migrations");
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_install_with_nothing_configured_is_not_configured() {
        let root = tempfile::tempdir().unwrap();
        let config_dir = root.path().join("config");

        let (_conn, status) = resolve_db_from_config_dir(&config_dir).unwrap();

        assert_eq!(status, DbStatus::NotConfigured);
    }

    #[test]
    fn configured_path_that_no_longer_exists_is_reported_missing_not_recreated() {
        let root = tempfile::tempdir().unwrap();
        let config_dir = root.path().join("config");
        let configured_path = root.path().join("moved-away.sqlite3");
        settings::save_db_file_path(&config_dir, path_string(&configured_path)).unwrap();

        let (_conn, status) = resolve_db_from_config_dir(&config_dir).unwrap();

        assert_eq!(
            status,
            DbStatus::Missing {
                path: path_string(&configured_path)
            }
        );
        // Must not have silently created an empty db at the missing path.
        assert!(!configured_path.exists());
    }

    #[test]
    fn configured_path_that_exists_loads_normally() {
        let root = tempfile::tempdir().unwrap();
        let config_dir = root.path().join("config");
        let configured_path = root.path().join("my-tasks.sqlite3");
        open_and_migrate(&configured_path).unwrap();
        settings::save_db_file_path(&config_dir, path_string(&configured_path)).unwrap();

        let (_conn, status) = resolve_db_from_config_dir(&config_dir).unwrap();

        assert_eq!(
            status,
            DbStatus::Ok {
                path: path_string(&configured_path)
            }
        );
    }
}
