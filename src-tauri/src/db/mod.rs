use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(include_str!("../../migrations/0001_init.sql"))])
}

pub fn init_db(app_handle: &AppHandle) -> Connection {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");

    let db_path = data_dir.join("kankouin.sqlite3");
    let mut conn = Connection::open(db_path).expect("failed to open sqlite database");

    conn.pragma_update(None, "journal_mode", "WAL")
        .expect("failed to set WAL journal mode");
    conn.pragma_update(None, "foreign_keys", "ON")
        .expect("failed to enable foreign keys");

    migrations()
        .to_latest(&mut conn)
        .expect("failed to run database migrations");

    conn
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
