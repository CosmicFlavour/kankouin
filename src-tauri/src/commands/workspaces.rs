use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::Workspace;

fn row_to_workspace(row: &rusqlite::Row) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        icon: row.get("icon")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn list(conn: &Connection) -> AppResult<Vec<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, icon, created_at, updated_at
         FROM workspaces ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], row_to_workspace)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub(crate) fn create(
    conn: &Connection,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<Workspace> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO workspaces (id, name, color, icon, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, name, color, icon, now],
    )?;
    Ok(Workspace {
        id,
        name,
        color,
        icon,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn update(
    conn: &Connection,
    id: String,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<Workspace> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE workspaces
         SET name = COALESCE(?2, name),
             color = COALESCE(?3, color),
             icon = COALESCE(?4, icon),
             updated_at = ?5
         WHERE id = ?1",
        params![id, name, color, icon, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    conn.query_row(
        "SELECT id, name, color, icon, created_at, updated_at
         FROM workspaces WHERE id = ?1",
        params![id],
        row_to_workspace,
    )
    .map_err(AppError::from)
}

fn delete(conn: &Connection, id: String) -> AppResult<()> {
    let changed = conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

#[tauri::command]
pub fn list_workspaces(state: State<AppState>) -> AppResult<Vec<Workspace>> {
    let conn = state.conn()?;
    list(&conn)
}

#[tauri::command]
pub fn create_workspace(
    state: State<AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<Workspace> {
    let conn = state.conn()?;
    create(&conn, name, color, icon)
}

#[tauri::command]
pub fn update_workspace(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<Workspace> {
    let conn = state.conn()?;
    update(&conn, id, name, color, icon)
}

#[tauri::command]
pub fn delete_workspace(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    delete(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_connection;

    #[test]
    fn create_list_update_delete_roundtrip() {
        let conn = test_connection();

        let ws = create(&conn, "Personal".into(), Some("#ff0000".into()), None).unwrap();
        assert_eq!(ws.name, "Personal");

        let all = list(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, ws.id);

        let updated = update(&conn, ws.id.clone(), Some("Personal Life".into()), None, None).unwrap();
        assert_eq!(updated.name, "Personal Life");
        assert_eq!(updated.color, Some("#ff0000".into()));

        delete(&conn, ws.id.clone()).unwrap();
        assert_eq!(list(&conn).unwrap().len(), 0);
    }

    #[test]
    fn update_missing_workspace_errors() {
        let conn = test_connection();
        let result = update(&conn, "does-not-exist".into(), Some("x".into()), None, None);
        assert!(matches!(result, Err(AppError::NotFound)));
    }

    #[test]
    fn delete_missing_workspace_errors() {
        let conn = test_connection();
        let result = delete(&conn, "does-not-exist".into());
        assert!(matches!(result, Err(AppError::NotFound)));
    }
}
