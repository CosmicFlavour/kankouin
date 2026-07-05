use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub struct AppState {
    pub db: Mutex<Connection>,
}

impl AppState {
    /// Locks the DB connection, turning a poisoned mutex into an `AppError`
    /// instead of panicking (a panic while a command holds this lock would
    /// otherwise take down every subsequent command).
    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db.lock().map_err(|_| AppError::Lock)
    }
}

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(include_str!("../../migrations/0001_init.sql")),
        M::up(include_str!("../../migrations/0002_state_since.sql")),
    ])
}

pub fn init_db(app_handle: &AppHandle) -> AppResult<Connection> {
    let data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;

    let db_path = data_dir.join("kankouin.sqlite3");
    let mut conn = Connection::open(db_path)?;

    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    migrations().to_latest(&mut conn)?;

    Ok(conn)
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
