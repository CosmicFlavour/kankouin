use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;

use crate::commands::tasks;
use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::FocusSession;

/// Sets `task_id` as the focus task, replacing whatever was focused before
/// (the `focus_session` table holds at most one row — see its migration).
/// Errors if `task_id` doesn't exist, same as any other command that takes
/// a task id.
pub(crate) fn set(conn: &Connection, task_id: String) -> AppResult<FocusSession> {
    let task = tasks::get(conn, &task_id)?;
    let started_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO focus_session (id, task_id, started_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET task_id = excluded.task_id, started_at = excluded.started_at",
        params![task_id, started_at],
    )?;
    Ok(FocusSession { task, started_at })
}

/// Clears the focus session unconditionally — the "Stop focusing" action.
pub(crate) fn clear(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM focus_session WHERE id = 1", [])?;
    Ok(())
}

pub(crate) fn get(conn: &Connection) -> AppResult<Option<FocusSession>> {
    let row = conn.query_row(
        "SELECT task_id, started_at FROM focus_session WHERE id = 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    let (task_id, started_at) = match row {
        Ok(row) => row,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(AppError::from(e)),
    };
    // `focus_session.task_id` cascades away with its task (see the
    // migration), so this should always resolve when a row exists.
    let task = tasks::get(conn, &task_id)?;
    Ok(Some(FocusSession { task, started_at }))
}

/// Clears the focus session if (and only if) it currently points at
/// `task_id` — called from `tasks::archive`/`tasks::update_state` (moving
/// to "done") so a finished or archived task doesn't linger as "in focus"
/// forever. A no-op when `task_id` isn't the focused task, which is the
/// common case for every ordinary archive/complete action.
pub(crate) fn clear_if_focused(conn: &Connection, task_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM focus_session WHERE id = 1 AND task_id = ?1",
        params![task_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn set_focus_task(state: State<AppState>, task_id: String) -> AppResult<FocusSession> {
    let conn = state.conn()?;
    set(&conn, task_id)
}

#[tauri::command]
pub fn clear_focus_task(state: State<AppState>) -> AppResult<()> {
    let conn = state.conn()?;
    clear(&conn)
}

#[tauri::command]
pub fn get_focus_task(state: State<AppState>) -> AppResult<Option<FocusSession>> {
    let conn = state.conn()?;
    get(&conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{projects, workspaces};
    use crate::db::test_connection;

    fn make_task(conn: &Connection, title: &str) -> String {
        let workspace_id = workspaces::create(conn, "WS".into(), None, None)
            .unwrap()
            .id;
        let project_id = projects::create(conn, workspace_id, "Proj".into(), None)
            .unwrap()
            .id;
        tasks::create(conn, project_id, title.into(), None, None, None, None)
            .unwrap()
            .id
    }

    #[test]
    fn no_focus_session_returns_none() {
        let conn = test_connection();
        assert!(get(&conn).unwrap().is_none());
    }

    #[test]
    fn set_then_get_round_trips() {
        let conn = test_connection();
        let task_id = make_task(&conn, "Write the plan");

        let session = set(&conn, task_id.clone()).unwrap();
        assert_eq!(session.task.id, task_id);
        assert_eq!(session.task.title, "Write the plan");

        let fetched = get(&conn).unwrap().unwrap();
        assert_eq!(fetched.task.id, task_id);
        assert_eq!(fetched.started_at, session.started_at);
    }

    #[test]
    fn setting_a_new_focus_replaces_the_old_one() {
        let conn = test_connection();
        let first = make_task(&conn, "First");
        let second = make_task(&conn, "Second");

        set(&conn, first).unwrap();
        set(&conn, second.clone()).unwrap();

        let fetched = get(&conn).unwrap().unwrap();
        assert_eq!(fetched.task.id, second);

        // Still at most one row, not two.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM focus_session", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn clear_removes_the_session() {
        let conn = test_connection();
        let task_id = make_task(&conn, "T");
        set(&conn, task_id).unwrap();

        clear(&conn).unwrap();

        assert!(get(&conn).unwrap().is_none());
    }

    #[test]
    fn clear_on_an_empty_session_is_not_an_error() {
        let conn = test_connection();
        clear(&conn).unwrap();
        assert!(get(&conn).unwrap().is_none());
    }

    #[test]
    fn set_on_a_nonexistent_task_errors() {
        let conn = test_connection();
        let result = set(&conn, "does-not-exist".into());
        assert!(matches!(result, Err(AppError::NotFound)));
    }

    #[test]
    fn clear_if_focused_only_clears_when_it_matches() {
        let conn = test_connection();
        let focused = make_task(&conn, "Focused");
        let other = make_task(&conn, "Other");
        set(&conn, focused.clone()).unwrap();

        // Some other task finishing/archiving must not touch an unrelated
        // focus session.
        clear_if_focused(&conn, &other).unwrap();
        assert!(get(&conn).unwrap().is_some());

        clear_if_focused(&conn, &focused).unwrap();
        assert!(get(&conn).unwrap().is_none());
    }

    #[test]
    fn deleting_the_focused_task_cascades_the_session_away() {
        let conn = test_connection();
        let task_id = make_task(&conn, "T");
        set(&conn, task_id.clone()).unwrap();

        conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])
            .unwrap();

        assert!(get(&conn).unwrap().is_none());
    }
}
