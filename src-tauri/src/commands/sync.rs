use std::path::Path;

use rusqlite::Connection;

use crate::error::AppResult;

/// Checkpoints the WAL (so no committed write is left stranded in the
/// `-wal` file), reads the live db file bytes from `conn`'s own path, and
/// writes `crypto::encrypt`'s output to `dest`.
pub fn export_to_file(_conn: &Connection, _passphrase: &str, _dest: &Path) -> AppResult<()> {
    todo!("PRAGMA wal_checkpoint(TRUNCATE); read conn.path() bytes; crypto::encrypt; write to dest")
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
pub fn import_from_file(_db_path: &Path, _passphrase: &str, _src: &Path) -> AppResult<()> {
    todo!("crypto::decrypt src into a temp file beside db_path, then fs::rename() over db_path")
}
