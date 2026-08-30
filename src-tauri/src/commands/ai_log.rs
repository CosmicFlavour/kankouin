use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::commands::tasks;
use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{AiActionLogEntry, Task};

/// Records a tool call the AI executed. `before_state`, when given, is
/// what makes the entry revertible — a full snapshot of the task as it
/// was immediately before this call mutated it (see `tasks::get` /
/// `tasks::restore_snapshot`). `arguments`/`before_state` are stored but
/// deliberately not part of the returned `AiActionLogEntry` — internal
/// bookkeeping, not something the chat UI needs to render.
pub(crate) fn record(
    conn: &Connection,
    tool_name: &str,
    arguments: &serde_json::Value,
    summary: String,
    task_id: Option<String>,
    before_state: Option<&Task>,
) -> AppResult<AiActionLogEntry> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let arguments_json = arguments.to_string();
    let before_json = before_state
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| AppError::Invalid(format!("failed to serialize before_state: {e}")))?;

    conn.execute(
        "INSERT INTO ai_action_log (id, tool_name, arguments, summary, task_id, before_state, reverted_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)",
        params![id, tool_name, arguments_json, summary, task_id, before_json, now],
    )?;

    Ok(AiActionLogEntry {
        id,
        tool_name: tool_name.to_string(),
        summary,
        task_id,
        revertible: before_state.is_some(),
        reverted_at: None,
    })
}

/// Restores the task to the state captured in `before_state` and marks
/// the entry reverted. Errors if the entry doesn't exist, was never
/// revertible (no `before_state` — e.g. `create_task`/`add_subtask`/
/// `set_task_tags`), or was already reverted.
pub(crate) fn revert(conn: &Connection, id: String) -> AppResult<Task> {
    let (before_state, reverted_at): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT before_state, reverted_at FROM ai_action_log WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound,
            other => AppError::from(other),
        })?;

    if reverted_at.is_some() {
        return Err(AppError::Invalid("this action was already reverted".into()));
    }
    let before_json =
        before_state.ok_or_else(|| AppError::Invalid("this action cannot be reverted".into()))?;
    let task: Task = serde_json::from_str(&before_json)
        .map_err(|e| AppError::Invalid(format!("corrupted action log entry: {e}")))?;

    let restored = tasks::restore_snapshot(conn, &task)?;

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE ai_action_log SET reverted_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;

    Ok(restored)
}

#[tauri::command]
pub fn revert_ai_action(state: State<AppState>, id: String) -> AppResult<Task> {
    let conn = state.conn()?;
    revert(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{projects, workspaces};
    use crate::db::test_connection;
    use serde_json::json;

    fn make_project(conn: &Connection) -> String {
        let workspace_id = workspaces::create(conn, "WS".into(), None, None)
            .unwrap()
            .id;
        projects::create(conn, workspace_id, "Proj".into(), None)
            .unwrap()
            .id
    }

    #[test]
    fn record_without_before_state_is_not_revertible() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        let task = tasks::create(&conn, project_id, "New".into(), None, None, None, None).unwrap();
        let entry = record(
            &conn,
            "create_task",
            &json!({ "title": "New" }),
            "Created task \"New\"".into(),
            Some(task.id),
            None,
        )
        .unwrap();

        assert!(!entry.revertible);
        assert_eq!(entry.reverted_at, None);
    }

    #[test]
    fn revert_restores_the_captured_snapshot_and_marks_the_entry_reverted() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        let task = tasks::create(
            &conn,
            project_id,
            "Original title".into(),
            None,
            None,
            None,
            Some("low".into()),
        )
        .unwrap();

        let before = tasks::get(&conn, &task.id).unwrap();
        tasks::update(
            &conn,
            task.id.clone(),
            Some("Changed title".into()),
            None,
            Some("high".into()),
            None,
            None,
        )
        .unwrap();

        let entry = record(
            &conn,
            "update_task",
            &json!({ "id": task.id }),
            "Updated \"Original title\"".into(),
            Some(task.id.clone()),
            Some(&before),
        )
        .unwrap();
        assert!(entry.revertible);

        let restored = revert(&conn, entry.id.clone()).unwrap();
        assert_eq!(restored.title, "Original title");
        assert_eq!(restored.priority, "low");

        let reverted_at: Option<String> = conn
            .query_row(
                "SELECT reverted_at FROM ai_action_log WHERE id = ?1",
                params![entry.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(reverted_at.is_some());
    }

    #[test]
    fn reverting_a_non_revertible_entry_errors() {
        let conn = test_connection();
        let entry = record(
            &conn,
            "create_task",
            &json!({}),
            "Created task".into(),
            None,
            None,
        )
        .unwrap();

        let result = revert(&conn, entry.id);
        assert!(matches!(result, Err(AppError::Invalid(_))));
    }

    #[test]
    fn reverting_twice_errors_the_second_time() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        let task = tasks::create(&conn, project_id, "T".into(), None, None, None, None).unwrap();
        let before = tasks::get(&conn, &task.id).unwrap();
        let entry = record(
            &conn,
            "archive_task",
            &json!({ "id": task.id }),
            "Archived \"T\"".into(),
            Some(task.id.clone()),
            Some(&before),
        )
        .unwrap();

        revert(&conn, entry.id.clone()).unwrap();
        let second = revert(&conn, entry.id);
        assert!(matches!(second, Err(AppError::Invalid(_))));
    }

    #[test]
    fn reverting_an_unknown_id_is_not_found() {
        let conn = test_connection();
        let result = revert(&conn, "does-not-exist".into());
        assert!(matches!(result, Err(AppError::NotFound)));
    }
}
