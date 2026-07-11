use std::collections::{HashMap, HashSet};

use chrono::{Datelike, Duration, Utc};
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{Subtask, Tag, Task, TaskDetail, TaskLogEntry, TaskSummary};

const TASK_COLUMNS: &str = "id, project_id, epic_id, user_story_id, title, description, state, \
     priority, deadline_type, exact_date, fuzzy_bucket, bucket_period, state_since, \
     archived, created_at, updated_at";

const TASK_COLUMNS_DEP_ALIASED: &str = "dep.id, dep.project_id, dep.epic_id, dep.user_story_id, \
     dep.title, dep.description, dep.state, dep.priority, dep.deadline_type, dep.exact_date, \
     dep.fuzzy_bucket, dep.bucket_period, dep.state_since, dep.archived, dep.created_at, \
     dep.updated_at";

const VALID_STATES: [&str; 4] = ["todo", "doing", "under_review", "done"];
const VALID_PRIORITIES: [&str; 3] = ["low", "medium", "high"];
const VALID_FUZZY_BUCKETS: [&str; 4] = ["this_week", "this_month", "this_quarter", "someday"];

/// Rejects enum-like string inputs before they reach SQL, so a bad value
/// from the frontend comes back as a clean `AppError::Invalid` instead of a
/// raw SQLite `CHECK` constraint violation.
fn validate_one_of(field: &str, value: &str, allowed: &[&str]) -> AppResult<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(AppError::Invalid(format!(
            "invalid {field} {value:?}, expected one of {allowed:?}"
        )))
    }
}

/// Maps a row selected via `TASK_COLUMNS` (or `TASK_COLUMNS_DEP_ALIASED`, or
/// any query producing the same plain column names) to a `Task`. Shared
/// outside this module so other commands querying the `tasks` table (e.g.
/// [tags.rs](crate::commands::tags)) don't duplicate the field list.
pub(crate) fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        epic_id: row.get("epic_id")?,
        user_story_id: row.get("user_story_id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        state: row.get("state")?,
        priority: row.get("priority")?,
        deadline_type: row.get("deadline_type")?,
        exact_date: row.get("exact_date")?,
        fuzzy_bucket: row.get("fuzzy_bucket")?,
        bucket_period: row.get("bucket_period")?,
        state_since: row.get("state_since")?,
        archived: row.get::<_, i64>("archived")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_subtask(row: &rusqlite::Row) -> rusqlite::Result<Subtask> {
    Ok(Subtask {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        title: row.get("title")?,
        done: row.get::<_, i64>("done")? != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
    })
}

fn row_to_log(row: &rusqlite::Row) -> rusqlite::Result<TaskLogEntry> {
    Ok(TaskLogEntry {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        entry_type: row.get("entry_type")?,
        content: row.get("content")?,
        created_at: row.get("created_at")?,
    })
}

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        name: row.get("name")?,
        color: row.get("color")?,
    })
}

fn not_found_on_no_rows(err: rusqlite::Error) -> AppError {
    match err {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound,
        other => AppError::from(other),
    }
}

fn get_task_row(conn: &Connection, id: &str) -> AppResult<Task> {
    conn.query_row(
        &format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1"),
        params![id],
        row_to_task,
    )
    .map_err(not_found_on_no_rows)
}

/// Joins tags and computes the `blocked` flag for a batch of tasks in 2
/// extra queries total (not per-task), so list views stay O(1) queries
/// regardless of how many tasks they return.
pub(crate) fn attach_tags_and_blocked(
    conn: &Connection,
    tasks: Vec<Task>,
) -> AppResult<Vec<TaskSummary>> {
    if tasks.is_empty() {
        return Ok(vec![]);
    }
    let ids: Vec<String> = tasks.iter().map(|t| t.id.clone()).collect();
    let tags_by_task = fetch_tags_for_tasks(conn, &ids)?;
    let blocked_ids = fetch_blocked_task_ids(conn, &ids)?;

    Ok(tasks
        .into_iter()
        .map(|task| {
            let tags = tags_by_task.get(&task.id).cloned().unwrap_or_default();
            let blocked = blocked_ids.contains(&task.id);
            TaskSummary {
                task,
                tags,
                blocked,
            }
        })
        .collect())
}

fn in_placeholders(count: usize) -> String {
    std::iter::repeat_n("?", count)
        .collect::<Vec<_>>()
        .join(",")
}

fn fetch_tags_for_tasks(
    conn: &Connection,
    task_ids: &[String],
) -> AppResult<HashMap<String, Vec<Tag>>> {
    let sql = format!(
        "SELECT tt.task_id, t.id, t.workspace_id, t.name, t.color
         FROM task_tags tt JOIN tags t ON t.id = tt.tag_id
         WHERE tt.task_id IN ({})",
        in_placeholders(task_ids.len())
    );
    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::ToSql> = task_ids
        .iter()
        .map(|id| id as &dyn rusqlite::ToSql)
        .collect();
    let rows = stmt.query_map(params.as_slice(), |row| {
        let task_id: String = row.get(0)?;
        Ok((task_id, row_to_tag(row)?))
    })?;

    let mut map: HashMap<String, Vec<Tag>> = HashMap::new();
    for row in rows {
        let (task_id, tag) = row?;
        map.entry(task_id).or_default().push(tag);
    }
    Ok(map)
}

fn fetch_blocked_task_ids(conn: &Connection, task_ids: &[String]) -> AppResult<HashSet<String>> {
    let sql = format!(
        "SELECT DISTINCT td.task_id
         FROM task_dependencies td JOIN tasks dep ON dep.id = td.depends_on_id
         WHERE td.task_id IN ({}) AND dep.state != 'done'",
        in_placeholders(task_ids.len())
    );
    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::ToSql> = task_ids
        .iter()
        .map(|id| id as &dyn rusqlite::ToSql)
        .collect();
    let rows = stmt.query_map(params.as_slice(), |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<HashSet<_>, _>>()?)
}

fn list(conn: &Connection, project_id: String) -> AppResult<Vec<TaskSummary>> {
    let sql = format!(
        "SELECT {TASK_COLUMNS} FROM tasks WHERE project_id = ?1 AND archived = 0 ORDER BY created_at ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let tasks = stmt
        .query_map(params![project_id], row_to_task)?
        .collect::<Result<Vec<_>, _>>()?;
    attach_tags_and_blocked(conn, tasks)
}

/// Tasks in `doing` or `under_review` whose current state started at or
/// before `cutoff_rfc3339` — the query behind Daily Review's stale-task
/// list ([daily_review.rs](crate::commands::daily_review)).
pub(crate) fn list_stale(conn: &Connection, cutoff_rfc3339: &str) -> AppResult<Vec<TaskSummary>> {
    let sql = format!(
        "SELECT {TASK_COLUMNS} FROM tasks
         WHERE state IN ('doing', 'under_review') AND state_since <= ?1 AND archived = 0
         ORDER BY state_since ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let tasks = stmt
        .query_map(params![cutoff_rfc3339], row_to_task)?
        .collect::<Result<Vec<_>, _>>()?;
    attach_tags_and_blocked(conn, tasks)
}

fn get_detail(conn: &Connection, id: String) -> AppResult<TaskDetail> {
    let task = get_task_row(conn, &id)?;

    let mut subtask_stmt = conn.prepare(
        "SELECT id, task_id, title, done, sort_order, created_at
         FROM subtasks WHERE task_id = ?1 ORDER BY sort_order ASC",
    )?;
    let subtasks = subtask_stmt
        .query_map(params![id], row_to_subtask)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut tag_stmt = conn.prepare(
        "SELECT t.id, t.workspace_id, t.name, t.color
         FROM task_tags tt JOIN tags t ON t.id = tt.tag_id WHERE tt.task_id = ?1",
    )?;
    let tags = tag_stmt
        .query_map(params![id], row_to_tag)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut log_stmt = conn.prepare(
        "SELECT id, task_id, entry_type, content, created_at
         FROM task_logs WHERE task_id = ?1 ORDER BY created_at ASC",
    )?;
    let logs = log_stmt
        .query_map(params![id], row_to_log)?
        .collect::<Result<Vec<_>, _>>()?;

    let dep_sql = format!(
        "SELECT {TASK_COLUMNS_DEP_ALIASED}
         FROM task_dependencies td JOIN tasks dep ON dep.id = td.depends_on_id
         WHERE td.task_id = ?1"
    );
    let mut dep_stmt = conn.prepare(&dep_sql)?;
    let blocked_by = dep_stmt
        .query_map(params![id], row_to_task)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(TaskDetail {
        task,
        subtasks,
        tags,
        logs,
        blocked_by,
    })
}

pub(crate) fn create(
    conn: &Connection,
    project_id: String,
    title: String,
    description: Option<String>,
    epic_id: Option<String>,
    user_story_id: Option<String>,
    priority: Option<String>,
) -> AppResult<Task> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let priority = priority.unwrap_or_else(|| "medium".to_string());
    validate_one_of("priority", &priority, &VALID_PRIORITIES)?;
    conn.execute(
        "INSERT INTO tasks (id, project_id, epic_id, user_story_id, title, description, state, priority, state_since, archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'todo', ?7, ?8, 0, ?8, ?8)",
        params![id, project_id, epic_id, user_story_id, title, description, priority, now],
    )?;
    Ok(Task {
        id,
        project_id,
        epic_id,
        user_story_id,
        title,
        description,
        state: "todo".into(),
        priority,
        deadline_type: None,
        exact_date: None,
        fuzzy_bucket: None,
        bucket_period: None,
        state_since: now.clone(),
        archived: false,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn update(
    conn: &Connection,
    id: String,
    title: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    epic_id: Option<String>,
    user_story_id: Option<String>,
) -> AppResult<Task> {
    if let Some(ref p) = priority {
        validate_one_of("priority", p, &VALID_PRIORITIES)?;
    }

    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE tasks
         SET title = COALESCE(?2, title),
             description = COALESCE(?3, description),
             priority = COALESCE(?4, priority),
             epic_id = COALESCE(?5, epic_id),
             user_story_id = COALESCE(?6, user_story_id),
             updated_at = ?7
         WHERE id = ?1",
        params![
            id,
            title,
            description,
            priority,
            epic_id,
            user_story_id,
            now
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    get_task_row(conn, &id)
}

pub(crate) fn update_state(
    conn: &mut Connection,
    id: String,
    new_state: String,
) -> AppResult<Task> {
    validate_one_of("state", &new_state, &VALID_STATES)?;

    let now = Utc::now().to_rfc3339();
    let current_state: String = conn
        .query_row("SELECT state FROM tasks WHERE id = ?1", params![id], |r| {
            r.get(0)
        })
        .map_err(not_found_on_no_rows)?;

    if current_state == new_state {
        return get_task_row(conn, &id);
    }

    // The state change and its log entry must land together: a crash between
    // the two would otherwise silently break the activity-log audit trail.
    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE tasks SET state = ?2, state_since = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, new_state, now, now],
    )?;

    tx.execute(
        "INSERT INTO task_logs (id, task_id, entry_type, content, created_at)
         VALUES (?1, ?2, 'state_change', ?3, ?4)",
        params![
            Uuid::new_v4().to_string(),
            id,
            format!("State changed from {current_state} to {new_state}"),
            now
        ],
    )?;

    tx.commit()?;

    get_task_row(conn, &id)
}

fn apply_deadline(
    conn: &Connection,
    id: String,
    deadline_type: String,
    exact_date: Option<String>,
    fuzzy_bucket: Option<String>,
) -> AppResult<Task> {
    let now = Utc::now().to_rfc3339();

    let (exact_date, fuzzy_bucket, bucket_period) = match deadline_type.as_str() {
        "exact" => {
            let exact_date = exact_date.ok_or_else(|| {
                AppError::Invalid("exact_date is required when deadline_type = exact".into())
            })?;
            (Some(exact_date), None, None)
        }
        "fuzzy" => {
            let bucket = fuzzy_bucket.ok_or_else(|| {
                AppError::Invalid("fuzzy_bucket is required when deadline_type = fuzzy".into())
            })?;
            validate_one_of("fuzzy_bucket", &bucket, &VALID_FUZZY_BUCKETS)?;
            let period = crate::dates::current_bucket_period(&bucket, Utc::now());
            (None, Some(bucket), period)
        }
        other => return Err(AppError::Invalid(format!("unknown deadline_type: {other}"))),
    };

    let changed = conn.execute(
        "UPDATE tasks
         SET deadline_type = ?2, exact_date = ?3, fuzzy_bucket = ?4, bucket_period = ?5, updated_at = ?6
         WHERE id = ?1",
        params![id, deadline_type, exact_date, fuzzy_bucket, bucket_period, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    get_task_row(conn, &id)
}

/// Reassigns a task's parent (Project / Epic / User Story). Unlike `update`,
/// this sets `epic_id`/`user_story_id` directly rather than via `COALESCE`,
/// since the caller needs to be able to clear either field back to NULL
/// (e.g. moving a task off a user story back onto the bare project).
fn set_parent(
    conn: &Connection,
    id: String,
    epic_id: Option<String>,
    user_story_id: Option<String>,
) -> AppResult<Task> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE tasks SET epic_id = ?2, user_story_id = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, epic_id, user_story_id, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    get_task_row(conn, &id)
}

fn archive(conn: &Connection, id: String) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE tasks SET archived = 1, updated_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

// Unlike archive, this is a permanent, unrecoverable removal — subtasks,
// logs, tags and dependencies all cascade away with it (see
// migrations/0001_init.sql).
fn delete(conn: &Connection, id: String) -> AppResult<()> {
    let changed = conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

fn list_today(conn: &Connection) -> AppResult<Vec<TaskSummary>> {
    let now = Utc::now();
    let days_from_monday = now.weekday().num_days_from_monday() as i64;
    let end_of_week = (now.date_naive() + Duration::days(6 - days_from_monday))
        .format("%Y-%m-%d")
        .to_string();

    let sql = format!(
        "SELECT {TASK_COLUMNS} FROM tasks
         WHERE deadline_type = 'exact' AND exact_date <= ?1 AND archived = 0 AND state != 'done'
         ORDER BY exact_date ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let tasks = stmt
        .query_map(params![end_of_week], row_to_task)?
        .collect::<Result<Vec<_>, _>>()?;
    attach_tags_and_blocked(conn, tasks)
}

fn priority_rank(priority: &str) -> u8 {
    match priority {
        "high" => 2,
        "medium" => 1,
        _ => 0,
    }
}

fn ready_to_work_on(conn: &Connection) -> AppResult<Vec<TaskSummary>> {
    let sql = format!("SELECT {TASK_COLUMNS} FROM tasks WHERE archived = 0 AND state != 'done'");
    let mut stmt = conn.prepare(&sql)?;
    let tasks = stmt
        .query_map([], row_to_task)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut summaries = attach_tags_and_blocked(conn, tasks)?;
    summaries.retain(|s| !s.blocked);
    summaries.sort_by(|a, b| {
        priority_rank(&b.task.priority)
            .cmp(&priority_rank(&a.task.priority))
            .then_with(|| {
                a.task
                    .exact_date
                    .clone()
                    .unwrap_or_default()
                    .cmp(&b.task.exact_date.clone().unwrap_or_default())
            })
    });
    Ok(summaries)
}

fn insert_subtask(conn: &Connection, task_id: String, title: String) -> AppResult<Subtask> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let sort_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM subtasks WHERE task_id = ?1",
        params![task_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT INTO subtasks (id, task_id, title, done, sort_order, created_at)
         VALUES (?1, ?2, ?3, 0, ?4, ?5)",
        params![id, task_id, title, sort_order, now],
    )?;
    Ok(Subtask {
        id,
        task_id,
        title,
        done: false,
        sort_order,
        created_at: now,
    })
}

fn flip_subtask(conn: &Connection, id: String) -> AppResult<Subtask> {
    let changed = conn.execute(
        "UPDATE subtasks SET done = CASE WHEN done = 0 THEN 1 ELSE 0 END WHERE id = ?1",
        params![id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    conn.query_row(
        "SELECT id, task_id, title, done, sort_order, created_at FROM subtasks WHERE id = ?1",
        params![id],
        row_to_subtask,
    )
    .map_err(AppError::from)
}

fn insert_log_entry(
    conn: &Connection,
    task_id: String,
    content: String,
) -> AppResult<TaskLogEntry> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO task_logs (id, task_id, entry_type, content, created_at)
         VALUES (?1, ?2, 'note', ?3, ?4)",
        params![id, task_id, content, now],
    )?;
    Ok(TaskLogEntry {
        id,
        task_id,
        entry_type: "note".into(),
        content,
        created_at: now,
    })
}

fn insert_dependency(conn: &Connection, task_id: String, depends_on_id: String) -> AppResult<()> {
    if task_id == depends_on_id {
        return Err(AppError::Invalid("a task cannot depend on itself".into()));
    }
    conn.execute(
        "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?1, ?2)",
        params![task_id, depends_on_id],
    )?;
    Ok(())
}

// Deliberately doesn't error on a missing row, unlike every other delete in
// this codebase: a "blocked by" link is a soft, togglable relationship,
// so removing one reads as "ensure it doesn't exist" rather than "delete
// this specific record" — same idempotent spirit as `insert_dependency`'s
// `INSERT OR IGNORE`.
fn delete_dependency(conn: &Connection, task_id: String, depends_on_id: String) -> AppResult<()> {
    conn.execute(
        "DELETE FROM task_dependencies WHERE task_id = ?1 AND depends_on_id = ?2",
        params![task_id, depends_on_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_tasks(state: State<AppState>, project_id: String) -> AppResult<Vec<TaskSummary>> {
    let conn = state.conn()?;
    list(&conn, project_id)
}

#[tauri::command]
pub fn get_task(state: State<AppState>, id: String) -> AppResult<TaskDetail> {
    let conn = state.conn()?;
    get_detail(&conn, id)
}

#[tauri::command]
pub fn create_task(
    state: State<AppState>,
    project_id: String,
    title: String,
    description: Option<String>,
    epic_id: Option<String>,
    user_story_id: Option<String>,
    priority: Option<String>,
) -> AppResult<Task> {
    let conn = state.conn()?;
    create(
        &conn,
        project_id,
        title,
        description,
        epic_id,
        user_story_id,
        priority,
    )
}

#[tauri::command]
pub fn update_task(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    epic_id: Option<String>,
    user_story_id: Option<String>,
) -> AppResult<Task> {
    let conn = state.conn()?;
    update(
        &conn,
        id,
        title,
        description,
        priority,
        epic_id,
        user_story_id,
    )
}

#[tauri::command]
pub fn update_task_state(state: State<AppState>, id: String, new_state: String) -> AppResult<Task> {
    let mut conn = state.conn()?;
    update_state(&mut conn, id, new_state)
}

#[tauri::command]
pub fn set_deadline(
    state: State<AppState>,
    id: String,
    deadline_type: String,
    exact_date: Option<String>,
    fuzzy_bucket: Option<String>,
) -> AppResult<Task> {
    let conn = state.conn()?;
    apply_deadline(&conn, id, deadline_type, exact_date, fuzzy_bucket)
}

#[tauri::command]
pub fn set_task_parent(
    state: State<AppState>,
    id: String,
    epic_id: Option<String>,
    user_story_id: Option<String>,
) -> AppResult<Task> {
    let conn = state.conn()?;
    set_parent(&conn, id, epic_id, user_story_id)
}

#[tauri::command]
pub fn archive_task(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    archive(&conn, id)
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    delete(&conn, id)
}

#[tauri::command]
pub fn list_tasks_today(state: State<AppState>) -> AppResult<Vec<TaskSummary>> {
    let conn = state.conn()?;
    list_today(&conn)
}

#[tauri::command]
pub fn list_ready_to_work_on(state: State<AppState>) -> AppResult<Vec<TaskSummary>> {
    let conn = state.conn()?;
    ready_to_work_on(&conn)
}

#[tauri::command]
pub fn add_subtask(state: State<AppState>, task_id: String, title: String) -> AppResult<Subtask> {
    let conn = state.conn()?;
    insert_subtask(&conn, task_id, title)
}

#[tauri::command]
pub fn toggle_subtask(state: State<AppState>, id: String) -> AppResult<Subtask> {
    let conn = state.conn()?;
    flip_subtask(&conn, id)
}

#[tauri::command]
pub fn add_log_entry(
    state: State<AppState>,
    task_id: String,
    content: String,
) -> AppResult<TaskLogEntry> {
    let conn = state.conn()?;
    insert_log_entry(&conn, task_id, content)
}

#[tauri::command]
pub fn set_dependency(
    state: State<AppState>,
    task_id: String,
    depends_on_id: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    insert_dependency(&conn, task_id, depends_on_id)
}

#[tauri::command]
pub fn remove_dependency(
    state: State<AppState>,
    task_id: String,
    depends_on_id: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    delete_dependency(&conn, task_id, depends_on_id)
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
    fn create_list_update_archive_roundtrip() {
        let conn = test_connection();
        let project_id = make_project(&conn);

        let task = create(
            &conn,
            project_id.clone(),
            "Write plan".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        assert_eq!(task.state, "todo");
        assert_eq!(task.priority, "medium");

        let listed = list(&conn, project_id.clone()).unwrap();
        assert_eq!(listed.len(), 1);
        assert!(!listed[0].blocked);
        assert!(listed[0].tags.is_empty());

        let updated = update(
            &conn,
            task.id.clone(),
            Some("Write the plan".into()),
            None,
            Some("high".into()),
            None,
            None,
        )
        .unwrap();
        assert_eq!(updated.title, "Write the plan");
        assert_eq!(updated.priority, "high");

        archive(&conn, task.id.clone()).unwrap();
        assert_eq!(list(&conn, project_id).unwrap().len(), 0);
    }

    #[test]
    fn delete_is_permanent_and_cascades_subtasks_and_logs() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        let task = create(&conn, project_id, "T".into(), None, None, None, None).unwrap();
        insert_subtask(&conn, task.id.clone(), "Sub".into()).unwrap();
        insert_log_entry(&conn, task.id.clone(), "Note".into()).unwrap();

        delete(&conn, task.id.clone()).unwrap();

        assert!(matches!(
            get_detail(&conn, task.id.clone()),
            Err(AppError::NotFound)
        ));
        let subtask_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM subtasks WHERE task_id = ?1",
                params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(subtask_count, 0);
    }

    #[test]
    fn delete_missing_task_errors() {
        let conn = test_connection();
        let result = delete(&conn, "does-not-exist".into());
        assert!(matches!(result, Err(AppError::NotFound)));
    }

    #[test]
    fn state_transition_stamps_state_since_and_logs() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);
        let task = create(&conn, project_id, "T".into(), None, None, None, None).unwrap();
        let created_state_since = task.state_since.clone();

        let doing = update_state(&mut conn, task.id.clone(), "doing".into()).unwrap();
        assert_ne!(doing.state_since, created_state_since);

        let under_review = update_state(&mut conn, task.id.clone(), "under_review".into()).unwrap();
        assert_ne!(under_review.state_since, doing.state_since);

        let done = update_state(&mut conn, task.id.clone(), "done".into()).unwrap();
        assert_ne!(done.state_since, under_review.state_since);

        let detail = get_detail(&conn, task.id).unwrap();
        let state_changes = detail
            .logs
            .iter()
            .filter(|l| l.entry_type == "state_change")
            .count();
        assert_eq!(state_changes, 3);
    }

    #[test]
    fn set_deadline_exact_and_fuzzy() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        let task = create(&conn, project_id, "T".into(), None, None, None, None).unwrap();

        let exact = apply_deadline(
            &conn,
            task.id.clone(),
            "exact".into(),
            Some("2026-08-01".into()),
            None,
        )
        .unwrap();
        assert_eq!(exact.exact_date, Some("2026-08-01".into()));
        assert_eq!(exact.fuzzy_bucket, None);

        let fuzzy = apply_deadline(
            &conn,
            task.id.clone(),
            "fuzzy".into(),
            None,
            Some("this_month".into()),
        )
        .unwrap();
        assert_eq!(fuzzy.fuzzy_bucket, Some("this_month".into()));
        assert_eq!(fuzzy.exact_date, None);
        assert!(fuzzy.bucket_period.is_some());

        let missing_bucket = apply_deadline(&conn, task.id, "fuzzy".into(), None, None);
        assert!(matches!(missing_bucket, Err(AppError::Invalid(_))));
    }

    #[test]
    fn set_parent_moves_between_epic_and_story_and_clears() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        let epic =
            crate::commands::epics::create(&conn, project_id.clone(), "Epic".into(), None).unwrap();
        let story = crate::commands::user_stories::create(
            &conn,
            project_id.clone(),
            Some(epic.id.clone()),
            "Story".into(),
            None,
        )
        .unwrap();
        let task = create(&conn, project_id, "T".into(), None, None, None, None).unwrap();

        let on_epic = set_parent(&conn, task.id.clone(), Some(epic.id.clone()), None).unwrap();
        assert_eq!(on_epic.epic_id, Some(epic.id));
        assert_eq!(on_epic.user_story_id, None);

        let on_story = set_parent(&conn, task.id.clone(), None, Some(story.id.clone())).unwrap();
        assert_eq!(on_story.epic_id, None);
        assert_eq!(on_story.user_story_id, Some(story.id));

        let cleared = set_parent(&conn, task.id, None, None).unwrap();
        assert_eq!(cleared.epic_id, None);
        assert_eq!(cleared.user_story_id, None);
    }

    #[test]
    fn dependency_blocks_until_resolved() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);
        let blocker = create(
            &conn,
            project_id.clone(),
            "Blocker".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let blocked_task = create(
            &conn,
            project_id.clone(),
            "Blocked".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        insert_dependency(&conn, blocked_task.id.clone(), blocker.id.clone()).unwrap();

        let listed = list(&conn, project_id.clone()).unwrap();
        let blocked_summary = listed
            .iter()
            .find(|s| s.task.id == blocked_task.id)
            .unwrap();
        assert!(blocked_summary.blocked);

        let ready = ready_to_work_on(&conn).unwrap();
        assert!(!ready.iter().any(|s| s.task.id == blocked_task.id));

        update_state(&mut conn, blocker.id.clone(), "done".into()).unwrap();

        let listed = list(&conn, project_id).unwrap();
        let blocked_summary = listed
            .iter()
            .find(|s| s.task.id == blocked_task.id)
            .unwrap();
        assert!(!blocked_summary.blocked);

        delete_dependency(&conn, blocked_task.id, blocker.id).unwrap();
    }

    #[test]
    fn subtasks_and_log_entries() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        let task = create(&conn, project_id, "T".into(), None, None, None, None).unwrap();

        let subtask = insert_subtask(&conn, task.id.clone(), "Step 1".into()).unwrap();
        assert!(!subtask.done);
        let toggled = flip_subtask(&conn, subtask.id.clone()).unwrap();
        assert!(toggled.done);

        insert_log_entry(&conn, task.id.clone(), "tried X".into()).unwrap();

        let detail = get_detail(&conn, task.id).unwrap();
        assert_eq!(detail.subtasks.len(), 1);
        assert!(detail.logs.iter().any(|l| l.content == "tried X"));
    }

    #[test]
    fn ready_to_work_on_sorts_by_priority() {
        let conn = test_connection();
        let project_id = make_project(&conn);
        create(
            &conn,
            project_id.clone(),
            "Low".into(),
            None,
            None,
            None,
            Some("low".into()),
        )
        .unwrap();
        create(
            &conn,
            project_id.clone(),
            "High".into(),
            None,
            None,
            None,
            Some("high".into()),
        )
        .unwrap();
        create(&conn, project_id, "Medium".into(), None, None, None, None).unwrap();

        let ready = ready_to_work_on(&conn).unwrap();
        let titles: Vec<&str> = ready.iter().map(|s| s.task.title.as_str()).collect();
        assert_eq!(titles, vec!["High", "Medium", "Low"]);
    }

    #[test]
    fn list_today_includes_overdue_and_this_week_only() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);

        let today = Utc::now().date_naive().format("%Y-%m-%d").to_string();
        let overdue_date = (Utc::now() - Duration::days(30))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        let future_date = (Utc::now() + Duration::days(30))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();

        let overdue = create(
            &conn,
            project_id.clone(),
            "Overdue".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        apply_deadline(
            &conn,
            overdue.id.clone(),
            "exact".into(),
            Some(overdue_date),
            None,
        )
        .unwrap();

        let this_week = create(
            &conn,
            project_id.clone(),
            "This week".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        apply_deadline(
            &conn,
            this_week.id.clone(),
            "exact".into(),
            Some(today.clone()),
            None,
        )
        .unwrap();

        let future = create(
            &conn,
            project_id.clone(),
            "Future".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        apply_deadline(
            &conn,
            future.id.clone(),
            "exact".into(),
            Some(future_date),
            None,
        )
        .unwrap();

        let done_task = create(
            &conn,
            project_id.clone(),
            "Done".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        apply_deadline(
            &conn,
            done_task.id.clone(),
            "exact".into(),
            Some(today.clone()),
            None,
        )
        .unwrap();
        update_state(&mut conn, done_task.id.clone(), "done".into()).unwrap();

        let fuzzy = create(
            &conn,
            project_id.clone(),
            "Fuzzy".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        apply_deadline(
            &conn,
            fuzzy.id.clone(),
            "fuzzy".into(),
            None,
            Some("this_week".into()),
        )
        .unwrap();

        let archived_task =
            create(&conn, project_id, "Archived".into(), None, None, None, None).unwrap();
        apply_deadline(
            &conn,
            archived_task.id.clone(),
            "exact".into(),
            Some(today),
            None,
        )
        .unwrap();
        archive(&conn, archived_task.id.clone()).unwrap();

        let today_list = list_today(&conn).unwrap();
        let ids: Vec<&str> = today_list.iter().map(|s| s.task.id.as_str()).collect();

        assert!(
            ids.contains(&overdue.id.as_str()),
            "overdue task should show"
        );
        assert!(
            ids.contains(&this_week.id.as_str()),
            "this-week task should show"
        );
        assert!(
            !ids.contains(&future.id.as_str()),
            "future task should be excluded"
        );
        assert!(
            !ids.contains(&done_task.id.as_str()),
            "done task should be excluded"
        );
        assert!(
            !ids.contains(&fuzzy.id.as_str()),
            "fuzzy-deadline task should be excluded"
        );
        assert!(
            !ids.contains(&archived_task.id.as_str()),
            "archived task should be excluded"
        );
    }

    #[test]
    fn rejects_invalid_enum_like_values_before_hitting_sql() {
        let mut conn = test_connection();
        let project_id = make_project(&conn);

        let bad_priority = create(
            &conn,
            project_id.clone(),
            "T".into(),
            None,
            None,
            None,
            Some("urgent".into()),
        );
        assert!(matches!(bad_priority, Err(AppError::Invalid(_))));

        let task = create(&conn, project_id, "T".into(), None, None, None, None).unwrap();

        let bad_update_priority = update(
            &conn,
            task.id.clone(),
            None,
            None,
            Some("urgent".into()),
            None,
            None,
        );
        assert!(matches!(bad_update_priority, Err(AppError::Invalid(_))));

        let bad_state = update_state(&mut conn, task.id.clone(), "in_progress".into());
        assert!(matches!(bad_state, Err(AppError::Invalid(_))));

        let bad_bucket = apply_deadline(
            &conn,
            task.id,
            "fuzzy".into(),
            None,
            Some("next_week".into()),
        );
        assert!(matches!(bad_bucket, Err(AppError::Invalid(_))));
    }
}
