use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::Project;

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        archived: row.get::<_, i64>("archived")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn list(conn: &Connection, workspace_id: String) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, description, archived, created_at, updated_at
         FROM projects WHERE workspace_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![workspace_id], row_to_project)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn create(
    conn: &Connection,
    workspace_id: String,
    name: String,
    description: Option<String>,
) -> AppResult<Project> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO projects (id, workspace_id, name, description, archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        params![id, workspace_id, name, description, now],
    )?;
    Ok(Project {
        id,
        workspace_id,
        name,
        description,
        archived: false,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn update(
    conn: &Connection,
    id: String,
    name: Option<String>,
    description: Option<String>,
) -> AppResult<Project> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE projects
         SET name = COALESCE(?2, name),
             description = COALESCE(?3, description),
             updated_at = ?4
         WHERE id = ?1",
        params![id, name, description, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    conn.query_row(
        "SELECT id, workspace_id, name, description, archived, created_at, updated_at
         FROM projects WHERE id = ?1",
        params![id],
        row_to_project,
    )
    .map_err(AppError::from)
}

fn archive(conn: &Connection, id: String) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE projects SET archived = 1, updated_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

#[tauri::command]
pub fn list_projects(state: State<AppState>, workspace_id: String) -> AppResult<Vec<Project>> {
    let conn = state.conn()?;
    list(&conn, workspace_id)
}

#[tauri::command]
pub fn create_project(
    state: State<AppState>,
    workspace_id: String,
    name: String,
    description: Option<String>,
) -> AppResult<Project> {
    let conn = state.conn()?;
    create(&conn, workspace_id, name, description)
}

#[tauri::command]
pub fn update_project(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
) -> AppResult<Project> {
    let conn = state.conn()?;
    update(&conn, id, name, description)
}

#[tauri::command]
pub fn archive_project(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    archive(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::workspaces;
    use crate::db::test_connection;

    fn make_workspace(conn: &Connection) -> String {
        workspaces::create(conn, "WS".into(), None, None).unwrap().id
    }

    #[test]
    fn create_list_update_archive_roundtrip() {
        let conn = test_connection();
        let workspace_id = make_workspace(&conn);

        let project = create(&conn, workspace_id.clone(), "Launch".into(), None).unwrap();
        assert_eq!(project.name, "Launch");
        assert!(!project.archived);

        let all = list(&conn, workspace_id.clone()).unwrap();
        assert_eq!(all.len(), 1);

        let updated = update(
            &conn,
            project.id.clone(),
            Some("Launch v2".into()),
            Some("desc".into()),
        )
        .unwrap();
        assert_eq!(updated.name, "Launch v2");
        assert_eq!(updated.description, Some("desc".into()));

        archive(&conn, project.id.clone()).unwrap();
        let after_archive = conn
            .query_row(
                "SELECT archived FROM projects WHERE id = ?1",
                params![project.id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(after_archive, 1);
    }

    #[test]
    fn update_missing_project_errors() {
        let conn = test_connection();
        let result = update(&conn, "does-not-exist".into(), Some("x".into()), None);
        assert!(matches!(result, Err(AppError::NotFound)));
    }
}
