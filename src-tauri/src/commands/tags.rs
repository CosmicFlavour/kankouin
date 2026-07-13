use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::Tag;

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        name: row.get("name")?,
        color: row.get("color")?,
    })
}

fn list(conn: &Connection, workspace_id: String) -> AppResult<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, color FROM tags WHERE workspace_id = ?1 ORDER BY name ASC",
    )?;
    let rows = stmt.query_map(params![workspace_id], row_to_tag)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn create(conn: &Connection, workspace_id: String, name: String, color: String) -> AppResult<Tag> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, workspace_id, name, color) VALUES (?1, ?2, ?3, ?4)",
        params![id, workspace_id, name, color],
    )?;
    Ok(Tag {
        id,
        workspace_id,
        name,
        color,
    })
}

fn delete(conn: &Connection, id: String) -> AppResult<()> {
    let changed = conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

fn replace_task_tags(
    conn: &mut Connection,
    task_id: String,
    tag_ids: Vec<String>,
) -> AppResult<()> {
    // Delete-then-reinsert must be atomic: a crash partway through would
    // otherwise leave the task with an empty or partial tag set instead of
    // either the old or the new one.
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM task_tags WHERE task_id = ?1", params![task_id])?;
    for tag_id in tag_ids {
        tx.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn list_tags(state: State<AppState>, workspace_id: String) -> AppResult<Vec<Tag>> {
    let conn = state.conn()?;
    list(&conn, workspace_id)
}

#[tauri::command]
pub fn create_tag(
    state: State<AppState>,
    workspace_id: String,
    name: String,
    color: String,
) -> AppResult<Tag> {
    let conn = state.conn()?;
    create(&conn, workspace_id, name, color)
}

#[tauri::command]
pub fn delete_tag(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    delete(&conn, id)
}

#[tauri::command]
pub fn set_task_tags(
    state: State<AppState>,
    task_id: String,
    tag_ids: Vec<String>,
) -> AppResult<()> {
    let mut conn = state.conn()?;
    replace_task_tags(&mut conn, task_id, tag_ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{projects, tasks, workspaces};
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
    fn create_list_delete_roundtrip() {
        let conn = test_connection();
        let workspace_id = workspaces::create(&conn, "WS2".into(), None, None)
            .unwrap()
            .id;

        let tag = create(
            &conn,
            workspace_id.clone(),
            "urgent".into(),
            "#ff0000".into(),
        )
        .unwrap();
        assert_eq!(tag.name, "urgent");

        let all = list(&conn, workspace_id).unwrap();
        assert_eq!(all.len(), 1);

        delete(&conn, tag.id).unwrap();
    }

    #[test]
    fn set_task_tags_replaces_existing_set() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);
        let workspace_id: String = conn
            .query_row(
                "SELECT workspace_id FROM projects WHERE id = ?1",
                params![project_id.clone()],
                |r| r.get(0),
            )
            .unwrap();
        let task = tasks::create(&conn, project_id, "T".into(), None, None, None, None).unwrap();

        let tag_a = create(&conn, workspace_id.clone(), "a".into(), "#111111".into()).unwrap();
        let tag_b = create(&conn, workspace_id, "b".into(), "#222222".into()).unwrap();

        let count_for_tag = |conn: &Connection, tag_id: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM task_tags WHERE tag_id = ?1",
                params![tag_id],
                |r| r.get(0),
            )
            .unwrap()
        };

        replace_task_tags(&mut conn, task.id.clone(), vec![tag_a.id.clone()]).unwrap();
        assert_eq!(count_for_tag(&conn, &tag_a.id), 1);

        replace_task_tags(&mut conn, task.id.clone(), vec![tag_b.id.clone()]).unwrap();
        assert_eq!(count_for_tag(&conn, &tag_a.id), 0);
        assert_eq!(count_for_tag(&conn, &tag_b.id), 1);
    }
}
