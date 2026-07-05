use chrono::{Duration, Utc};
use tauri::State;

use crate::commands::tasks;
use crate::db::AppState;
use crate::error::AppResult;
use crate::models::TaskSummary;

/// How long a task can sit in `doing` or `under_review` before Daily Review
/// surfaces it. Hardcoded for now — becomes a real user setting once there's
/// a Settings UI to attach it to.
const STALE_AFTER_DAYS: i64 = 7;

fn stale_cutoff() -> String {
    (Utc::now() - Duration::days(STALE_AFTER_DAYS)).to_rfc3339()
}

#[tauri::command]
pub fn get_stale_tasks(state: State<AppState>) -> AppResult<Vec<TaskSummary>> {
    let conn = state.conn()?;
    tasks::list_stale(&conn, &stale_cutoff())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{projects, tasks as tasks_cmds, workspaces};
    use crate::db::test_connection;
    use rusqlite::{params, Connection};

    fn make_project(conn: &Connection) -> String {
        let workspace_id = workspaces::create(conn, "WS".into(), None, None)
            .unwrap()
            .id;
        projects::create(conn, workspace_id, "Proj".into(), None)
            .unwrap()
            .id
    }

    fn backdate(conn: &Connection, task_id: &str, days_ago: i64) {
        let past = (Utc::now() - Duration::days(days_ago)).to_rfc3339();
        conn.execute(
            "UPDATE tasks SET state_since = ?2 WHERE id = ?1",
            params![task_id, past],
        )
        .unwrap();
    }

    #[test]
    fn fresh_doing_task_is_not_stale() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);
        let task =
            tasks_cmds::create(&conn, project_id, "T".into(), None, None, None, None).unwrap();
        tasks_cmds::update_state(&mut conn, task.id.clone(), "doing".into()).unwrap();

        assert!(tasks::list_stale(&conn, &stale_cutoff())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn old_doing_and_under_review_tasks_are_stale() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);

        let doing = tasks_cmds::create(
            &conn,
            project_id.clone(),
            "Doing".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        tasks_cmds::update_state(&mut conn, doing.id.clone(), "doing".into()).unwrap();
        backdate(&conn, &doing.id, 8);

        let reviewed =
            tasks_cmds::create(&conn, project_id, "Reviewed".into(), None, None, None, None)
                .unwrap();
        tasks_cmds::update_state(&mut conn, reviewed.id.clone(), "under_review".into()).unwrap();
        backdate(&conn, &reviewed.id, 8);

        let stale = tasks::list_stale(&conn, &stale_cutoff()).unwrap();
        let stale_ids: Vec<&str> = stale.iter().map(|s| s.task.id.as_str()).collect();
        assert!(stale_ids.contains(&doing.id.as_str()));
        assert!(stale_ids.contains(&reviewed.id.as_str()));
    }

    #[test]
    fn stale_todo_done_and_archived_tasks_are_excluded() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);

        let todo = tasks_cmds::create(
            &conn,
            project_id.clone(),
            "Todo".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        backdate(&conn, &todo.id, 30);

        let done = tasks_cmds::create(
            &conn,
            project_id.clone(),
            "Done".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        tasks_cmds::update_state(&mut conn, done.id.clone(), "done".into()).unwrap();
        backdate(&conn, &done.id, 30);

        let archived =
            tasks_cmds::create(&conn, project_id, "Archived".into(), None, None, None, None)
                .unwrap();
        tasks_cmds::update_state(&mut conn, archived.id.clone(), "doing".into()).unwrap();
        backdate(&conn, &archived.id, 30);
        conn.execute(
            "UPDATE tasks SET archived = 1 WHERE id = ?1",
            params![archived.id],
        )
        .unwrap();

        assert!(tasks::list_stale(&conn, &stale_cutoff())
            .unwrap()
            .is_empty());
    }
}
