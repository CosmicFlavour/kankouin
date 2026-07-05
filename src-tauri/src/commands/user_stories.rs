use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::UserStory;

fn row_to_user_story(row: &rusqlite::Row) -> rusqlite::Result<UserStory> {
    Ok(UserStory {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        epic_id: row.get("epic_id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn list(conn: &Connection, project_id: String) -> AppResult<Vec<UserStory>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, epic_id, title, description, created_at, updated_at
         FROM user_stories WHERE project_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_user_story)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub(crate) fn create(
    conn: &Connection,
    project_id: String,
    epic_id: Option<String>,
    title: String,
    description: Option<String>,
) -> AppResult<UserStory> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO user_stories (id, project_id, epic_id, title, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, project_id, epic_id, title, description, now],
    )?;
    Ok(UserStory {
        id,
        project_id,
        epic_id,
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
    epic_id: Option<String>,
) -> AppResult<UserStory> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE user_stories
         SET title = COALESCE(?2, title),
             description = COALESCE(?3, description),
             epic_id = COALESCE(?4, epic_id),
             updated_at = ?5
         WHERE id = ?1",
        params![id, title, description, epic_id, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    conn.query_row(
        "SELECT id, project_id, epic_id, title, description, created_at, updated_at
         FROM user_stories WHERE id = ?1",
        params![id],
        row_to_user_story,
    )
    .map_err(AppError::from)
}

fn delete(conn: &Connection, id: String) -> AppResult<()> {
    let changed = conn.execute("DELETE FROM user_stories WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

#[tauri::command]
pub fn list_user_stories(state: State<AppState>, project_id: String) -> AppResult<Vec<UserStory>> {
    let conn = state.conn()?;
    list(&conn, project_id)
}

#[tauri::command]
pub fn create_user_story(
    state: State<AppState>,
    project_id: String,
    epic_id: Option<String>,
    title: String,
    description: Option<String>,
) -> AppResult<UserStory> {
    let conn = state.conn()?;
    create(&conn, project_id, epic_id, title, description)
}

#[tauri::command]
pub fn update_user_story(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    epic_id: Option<String>,
) -> AppResult<UserStory> {
    let conn = state.conn()?;
    update(&conn, id, title, description, epic_id)
}

#[tauri::command]
pub fn delete_user_story(state: State<AppState>, id: String) -> AppResult<()> {
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

        let story = create(&conn, project_id.clone(), None, "As a user...".into(), None).unwrap();
        assert_eq!(story.title, "As a user...");
        assert_eq!(story.epic_id, None);

        let all = list(&conn, project_id.clone()).unwrap();
        assert_eq!(all.len(), 1);

        let updated = update(&conn, story.id.clone(), Some("Updated".into()), None, None).unwrap();
        assert_eq!(updated.title, "Updated");

        delete(&conn, story.id.clone()).unwrap();
        assert_eq!(list(&conn, project_id).unwrap().len(), 0);
    }

    #[test]
    fn update_missing_user_story_errors() {
        let conn = test_connection();
        let result = update(&conn, "does-not-exist".into(), Some("x".into()), None, None);
        assert!(matches!(result, Err(AppError::NotFound)));
    }
}
