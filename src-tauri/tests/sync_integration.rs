//! Integration tests for `commands::sync`. These deliberately don't fit as
//! inline unit tests: they need real on-disk SQLite files (the raw-byte
//! export/import approach can't be exercised against an in-memory
//! connection) and exercise export.rs/sync.rs as a black box through the
//! crate's public API.

use std::fs;

use kankouin_lib::db;

const WORKSPACE_INSERT: &str = "INSERT INTO workspaces (id, name, created_at, updated_at) \
     VALUES ('ws1', 'Personal', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')";

#[test]
fn export_then_import_round_trips_data() {
    let dir = tempfile::tempdir().unwrap();
    let source_db = dir.path().join("source.sqlite3");
    let target_db = dir.path().join("target.sqlite3");
    let export_file = dir.path().join("export.kankouin");

    let conn = db::open_and_migrate(&source_db).unwrap();
    conn.execute(WORKSPACE_INSERT, []).unwrap();

    kankouin_lib::commands::sync::export_to_file(
        &conn,
        "correct horse battery staple",
        &export_file,
    )
    .unwrap();
    drop(conn);

    kankouin_lib::commands::sync::import_from_file(
        &target_db,
        "correct horse battery staple",
        &export_file,
    )
    .unwrap();

    let imported = db::open_and_migrate(&target_db).unwrap();
    let name: String = imported
        .query_row("SELECT name FROM workspaces WHERE id = 'ws1'", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(name, "Personal");
}

#[test]
fn export_checkpoints_wal_before_reading_file() {
    let dir = tempfile::tempdir().unwrap();
    let source_db = dir.path().join("source.sqlite3");
    let target_db = dir.path().join("target.sqlite3");
    let export_file = dir.path().join("export.kankouin");

    let conn = db::open_and_migrate(&source_db).unwrap();
    conn.execute(WORKSPACE_INSERT, []).unwrap();
    // Deliberately no explicit checkpoint here — export_to_file must run
    // PRAGMA wal_checkpoint(TRUNCATE) itself, otherwise a write still
    // sitting only in the -wal file would be silently dropped from the
    // raw file copy.

    kankouin_lib::commands::sync::export_to_file(&conn, "pw", &export_file).unwrap();
    kankouin_lib::commands::sync::import_from_file(&target_db, "pw", &export_file).unwrap();

    let imported = db::open_and_migrate(&target_db).unwrap();
    let count: i64 = imported
        .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn wrong_passphrase_leaves_local_file_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let source_db = dir.path().join("source.sqlite3");
    let target_db = dir.path().join("target.sqlite3");
    let export_file = dir.path().join("export.kankouin");

    let conn = db::open_and_migrate(&source_db).unwrap();
    kankouin_lib::commands::sync::export_to_file(&conn, "right passphrase", &export_file).unwrap();

    // Target already has its own pre-existing local content.
    let target_conn = db::open_and_migrate(&target_db).unwrap();
    target_conn
        .execute(
            "INSERT INTO workspaces (id, name, created_at, updated_at) \
             VALUES ('local', 'Local Only', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
    drop(target_conn);
    let before = fs::read(&target_db).unwrap();

    let result = kankouin_lib::commands::sync::import_from_file(
        &target_db,
        "wrong passphrase",
        &export_file,
    );
    assert!(result.is_err());

    let after = fs::read(&target_db).unwrap();
    assert_eq!(
        before, after,
        "a failed import must not touch the local db file"
    );
}

#[test]
fn corrupted_export_file_is_rejected_cleanly() {
    let dir = tempfile::tempdir().unwrap();
    let target_db = dir.path().join("target.sqlite3");
    let bogus_file = dir.path().join("bogus.kankouin");
    fs::write(&bogus_file, b"not a real export").unwrap();

    let result =
        kankouin_lib::commands::sync::import_from_file(&target_db, "any passphrase", &bogus_file);
    assert!(result.is_err());
}
