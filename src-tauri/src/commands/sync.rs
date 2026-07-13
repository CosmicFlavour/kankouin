use std::fs;
use std::path::Path;

use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::commands::crypto;
use crate::db;
use crate::error::{AppError, AppResult};

/// Checkpoints the WAL (so no committed write is left stranded in the
/// `-wal` file), reads the live db file bytes from `conn`'s own path, and
/// returns `crypto::encrypt`'s output — the same bytes whether they end up
/// in a local file (`export_to_file`) or uploaded to cloud storage
/// (`commands::cloud_sync::push_to_cloud`).
pub fn encrypt_db_to_bytes(conn: &Connection, passphrase: &str) -> AppResult<Vec<u8>> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;

    let db_path = conn
        .path()
        .ok_or_else(|| AppError::Invalid("database has no backing file to export".into()))?;
    let plaintext = fs::read(db_path)?;

    crypto::encrypt(passphrase, &plaintext)
}

/// Decrypts `container` into a staging file next to `db_path` and only
/// renames it over `db_path` on success, so a wrong passphrase or corrupted
/// container never touches existing local data.
///
/// Takes a path rather than a live `Connection`: replacing the file backing
/// an open SQLite connection is unsafe. `import_bytes_swapping_connection`
/// below is responsible for closing/reopening the connection around this call.
fn decrypt_and_replace_db_file(
    db_path: &Path,
    passphrase: &str,
    container: &[u8],
) -> AppResult<()> {
    let plaintext = crypto::decrypt(passphrase, container)?;

    let file_name = db_path
        .file_name()
        .ok_or_else(|| AppError::Invalid("db_path has no file name".into()))?
        .to_string_lossy();
    let staging_path = db_path.with_file_name(format!("{file_name}.importing"));

    fs::write(&staging_path, &plaintext)?;
    fs::rename(&staging_path, db_path)?;
    Ok(())
}

/// Imports `container` bytes into the database backing `conn`, swapping
/// `conn` itself over to the freshly-imported data (or, on failure, back to
/// its original state — `decrypt_and_replace_db_file` guarantees the
/// on-disk file is only ever touched on success).
///
/// The swap: `conn`'s file handle must be released before the file on disk
/// can be replaced, so `conn` is first pointed at a throwaway in-memory
/// database (dropping the real connection), then reopened against
/// `db_path` once the replace has run — whether it succeeded or not.
pub fn import_bytes_swapping_connection(
    conn: &mut Connection,
    passphrase: &str,
    container: &[u8],
) -> AppResult<()> {
    let db_path = conn
        .path()
        .ok_or_else(|| AppError::Invalid("database has no backing file to import into".into()))?
        .to_string();

    *conn = Connection::open_in_memory()?;

    let import_result = decrypt_and_replace_db_file(Path::new(&db_path), passphrase, container);
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

pub fn touch_synced(conn: &Connection) -> AppResult<()> {
    ensure_sync_meta(conn)?;
    conn.execute(
        "UPDATE sync_meta SET last_synced_at = ?1 WHERE id = 1",
        params![Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_connection;

    #[test]
    fn touch_synced_creates_meta_row_lazily() {
        let conn = test_connection();
        touch_synced(&conn).unwrap();
        let device_id: String = conn
            .query_row("SELECT device_id FROM sync_meta WHERE id = 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(!device_id.is_empty());
    }

    #[test]
    fn touch_synced_sets_last_synced_at() {
        let conn = test_connection();
        touch_synced(&conn).unwrap();
        let last_synced_at: Option<String> = conn
            .query_row(
                "SELECT last_synced_at FROM sync_meta WHERE id = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(last_synced_at.is_some());
    }
}
