use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::Epic;

fn row_to_epic(row: &rusqlite::Row) -> rusqlite::Result<Epic> {
    Ok(Epic {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn list(conn: &Connection, project_id: String) -> AppResult<Vec<Epic>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, created_at, updated_at
         FROM epics WHERE project_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_epic)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub(crate) fn create(
    conn: &Connection,
    project_id: String,
    title: String,
    description: Option<String>,
) -> AppResult<Epic> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO epics (id, project_id, title, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, project_id, title, description, now],
    )?;
    Ok(Epic {
        id,
        project_id,
        title,
        description,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn update(
    conn: &Connection,
    id: String,
    title: Option<String>,
    description: Option<String>,
) -> AppResult<Epic> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE epics
         SET title = COALESCE(?2, title),
             description = COALESCE(?3, description),
             updated_at = ?4
         WHERE id = ?1",
        params![id, title, description, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    conn.query_row(
        "SELECT id, project_id, title, description, created_at, updated_at
         FROM epics WHERE id = ?1",
        params![id],
        row_to_epic,
    )
    .map_err(AppError::from)
}

fn delete(conn: &Connection, id: String) -> AppResult<()> {
    let changed = conn.execute("DELETE FROM epics WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

#[tauri::command]
pub fn list_epics(state: State<AppState>, project_id: String) -> AppResult<Vec<Epic>> {
    let conn = state.conn()?;
    list(&conn, project_id)
}

#[tauri::command]
pub fn create_epic(
    state: State<AppState>,
    project_id: String,
    title: String,
    description: Option<String>,
) -> AppResult<Epic> {
    let conn = state.conn()?;
    create(&conn, project_id, title, description)
}

#[tauri::command]
pub fn update_epic(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
) -> AppResult<Epic> {
    let conn = state.conn()?;
    update(&conn, id, title, description)
}

#[tauri::command]
pub fn delete_epic(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    delete(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::projects;
    use crate::commands::workspaces;
    use crate::db::test_connection;

    fn make_project(conn: &Connection) -> String {
        let workspace_id = workspaces::create(conn, "WS".into(), None, None)
            .unwrap()
            .id;
        projects::create(conn, workspace_id, "Proj".into(), None)
            .unwrap()
            .id
    }

    #[test]
    fn create_list_update_delete_roundtrip() {
        let conn = test_connection();
        let project_id = make_project(&conn);

        let epic = create(&conn, project_id.clone(), "Launch".into(), None).unwrap();
        assert_eq!(epic.title, "Launch");

        let all = list(&conn, project_id.clone()).unwrap();
        assert_eq!(all.len(), 1);

        let updated = update(&conn, epic.id.clone(), Some("Launch v2".into()), None).unwrap();
        assert_eq!(updated.title, "Launch v2");

        delete(&conn, epic.id.clone()).unwrap();
        assert_eq!(list(&conn, project_id).unwrap().len(), 0);
    }

    #[test]
    fn update_missing_epic_errors() {
        let conn = test_connection();
        let result = update(&conn, "does-not-exist".into(), Some("x".into()), None);
        assert!(matches!(result, Err(AppError::NotFound)));
    }
}
