use std::fs;
use std::path::Path;

use rusqlite::Connection;

use crate::commands::crypto;
use crate::error::{AppError, AppResult};

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
/// an open SQLite connection is unsafe, so the `import_encrypted` Tauri
/// command is responsible for closing (dropping) its `AppState` connection
/// before calling this, and reopening one (via `db::open_and_migrate`)
/// after it returns.
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
