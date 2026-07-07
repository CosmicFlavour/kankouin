use std::fs;
use std::path::Path;

use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::commands::crypto;
use crate::db::{self, AppState};
use crate::error::{AppError, AppResult};
use crate::models::SyncMeta;

/// Checkpoints the WAL (so no committed write is left stranded in the
/// `-wal` file), reads the live db file bytes from `conn`'s own path, and
/// writes `crypto::encrypt`'s output to `dest`.
pub fn export_to_file(conn: &Connection, passphrase: &str, dest: &Path) -> AppResult<()> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;

    let db_path = conn
        .path()
        .ok_or_else(|| AppError::Invalid("database has no backing file to export".into()))?;
    let plaintext = fs::read(db_path)?;

    let container = crypto::encrypt(passphrase, &plaintext)?;
    fs::write(dest, container)?;
    Ok(())
}

/// Decrypts `src` into a staging file next to `db_path` and only renames it
/// over `db_path` on success, so a wrong passphrase or corrupted file never
/// touches existing local data.
///
/// Takes a path rather than a live `Connection`: replacing the file backing
/// an open SQLite connection is unsafe. `import_swapping_connection` below
/// is responsible for closing/reopening the connection around this call.
pub fn import_from_file(db_path: &Path, passphrase: &str, src: &Path) -> AppResult<()> {
    let container = fs::read(src)?;
    let plaintext = crypto::decrypt(passphrase, &container)?;

    let file_name = db_path
        .file_name()
        .ok_or_else(|| AppError::Invalid("db_path has no file name".into()))?
        .to_string_lossy();
    let staging_path = db_path.with_file_name(format!("{file_name}.importing"));

    fs::write(&staging_path, &plaintext)?;
    fs::rename(&staging_path, db_path)?;
    Ok(())
}

/// Imports `file_path` into the database backing `conn`, swapping `conn`
/// itself over to the freshly-imported data (or, on failure, back to its
/// original state — `import_from_file` guarantees the on-disk file is only
/// ever touched on success).
///
/// The swap: `conn`'s file handle must be released before the file on disk
/// can be replaced, so `conn` is first pointed at a throwaway in-memory
/// database (dropping the real connection), then reopened against
/// `db_path` once `import_from_file` has run — whether it succeeded or not.
pub fn import_swapping_connection(
    conn: &mut Connection,
    passphrase: &str,
    file_path: &Path,
) -> AppResult<()> {
    let db_path = conn
        .path()
        .ok_or_else(|| AppError::Invalid("database has no backing file to import into".into()))?
        .to_string();

    *conn = Connection::open_in_memory()?;

    let import_result = import_from_file(Path::new(&db_path), passphrase, file_path);
    *conn = db::open_and_migrate(Path::new(&db_path))?;

    import_result?;
    touch_synced(conn)?;
    Ok(())
}

fn ensure_sync_meta(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "INSERT INTO sync_meta (id, device_id, last_synced_at) VALUES (1, ?1, NULL)
         ON CONFLICT(id) DO NOTHING",
        params![Uuid::new_v4().to_string()],
    )?;
    Ok(())
}

fn touch_synced(conn: &Connection) -> AppResult<()> {
    ensure_sync_meta(conn)?;
    conn.execute(
        "UPDATE sync_meta SET last_synced_at = ?1 WHERE id = 1",
        params![Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

fn status(conn: &Connection) -> AppResult<SyncMeta> {
    ensure_sync_meta(conn)?;
    conn.query_row(
        "SELECT device_id, last_synced_at FROM sync_meta WHERE id = 1",
        [],
        |row| {
            Ok(SyncMeta {
                device_id: row.get("device_id")?,
                last_synced_at: row.get("last_synced_at")?,
            })
        },
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn export_encrypted(
    state: State<AppState>,
    passphrase: String,
    file_path: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    export_to_file(&conn, &passphrase, Path::new(&file_path))?;
    touch_synced(&conn)
}

#[tauri::command]
pub fn import_encrypted(
    state: State<AppState>,
    passphrase: String,
    file_path: String,
) -> AppResult<()> {
    let mut conn = state.conn()?;
    import_swapping_connection(&mut conn, &passphrase, Path::new(&file_path))
}

#[tauri::command]
pub fn get_sync_status(state: State<AppState>) -> AppResult<SyncMeta> {
    let conn = state.conn()?;
    status(&conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_connection;

    #[test]
    fn status_creates_meta_row_lazily_with_no_sync_yet() {
        let conn = test_connection();
        let meta = status(&conn).unwrap();
        assert!(!meta.device_id.is_empty());
        assert_eq!(meta.last_synced_at, None);
    }

    #[test]
    fn status_is_stable_across_calls() {
        let conn = test_connection();
        let first = status(&conn).unwrap();
        let second = status(&conn).unwrap();
        assert_eq!(first.device_id, second.device_id);
    }

    #[test]
    fn touch_synced_sets_last_synced_at() {
        let conn = test_connection();
        touch_synced(&conn).unwrap();
        let meta = status(&conn).unwrap();
        assert!(meta.last_synced_at.is_some());
    }
}
