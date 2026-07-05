use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::commands::tasks;
use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{Tag, Task, TaskSummary};

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

fn replace_task_tags(conn: &Connection, task_id: String, tag_ids: Vec<String>) -> AppResult<()> {
    conn.execute("DELETE FROM task_tags WHERE task_id = ?1", params![task_id])?;
    for tag_id in tag_ids {
        conn.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )?;
    }
    Ok(())
}

fn tasks_for_tag(conn: &Connection, tag_id: String) -> AppResult<Vec<TaskSummary>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.project_id, t.epic_id, t.user_story_id, t.title, t.description, t.state,
                t.priority, t.deadline_type, t.exact_date, t.fuzzy_bucket, t.bucket_period,
                t.state_since, t.archived, t.created_at, t.updated_at
         FROM tasks t JOIN task_tags tt ON tt.task_id = t.id
         WHERE tt.tag_id = ?1 AND t.archived = 0
         ORDER BY t.created_at ASC",
    )?;
    let tasks = stmt
        .query_map(params![tag_id], |row| {
            Ok(Task {
                id: row.get(0)?,
                project_id: row.get(1)?,
                epic_id: row.get(2)?,
                user_story_id: row.get(3)?,
                title: row.get(4)?,
                description: row.get(5)?,
                state: row.get(6)?,
                priority: row.get(7)?,
                deadline_type: row.get(8)?,
                exact_date: row.get(9)?,
                fuzzy_bucket: row.get(10)?,
                bucket_period: row.get(11)?,
                state_since: row.get(12)?,
                archived: row.get::<_, i64>(13)? != 0,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    tasks::attach_tags_and_blocked(conn, tasks)
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
    let conn = state.conn()?;
    replace_task_tags(&conn, task_id, tag_ids)
}

#[tauri::command]
pub fn list_tasks_by_tag(state: State<AppState>, tag_id: String) -> AppResult<Vec<TaskSummary>> {
    let conn = state.conn()?;
    tasks_for_tag(&conn, tag_id)
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
        let conn = test_connection();
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

        replace_task_tags(&conn, task.id.clone(), vec![tag_a.id.clone()]).unwrap();
        let by_a = tasks_for_tag(&conn, tag_a.id.clone()).unwrap();
        assert_eq!(by_a.len(), 1);

        replace_task_tags(&conn, task.id.clone(), vec![tag_b.id.clone()]).unwrap();
        let by_a_after = tasks_for_tag(&conn, tag_a.id).unwrap();
        assert_eq!(by_a_after.len(), 0);
        let by_b = tasks_for_tag(&conn, tag_b.id).unwrap();
        assert_eq!(by_b.len(), 1);
        assert_eq!(by_b[0].tags.len(), 1);
        assert_eq!(by_b[0].tags[0].name, "b");
    }
}
