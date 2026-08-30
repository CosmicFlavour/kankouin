use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::commands::{ai_log, epics, projects, tags, tasks, user_stories};
use crate::db::AppState;
use crate::error::{AppError, AppResult};

use super::{ToolCall, ToolContext, ToolDefinition, ToolExecutionResult, ToolExecutor};

/// The full toolbox the AI is told about: JSON-schema descriptions of every
/// command `CommandToolExecutor` knows how to dispatch. `project_id` is
/// listed as optional on tools that take it — when the AI omits it,
/// `merge_context` fills it in from the frontend's current context, so the
/// AI isn't required to know (or guess) it up front.
pub fn toolbox() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "add_subtask".into(),
            description: "Adds a subtask (a small, concrete checklist step) under an existing \
                task. Use this to break a task down into steps a user can complete one at a \
                time, rather than leaving one large, ambiguous task."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "task_id": { "type": "string", "description": "ID of the parent task" },
                    "title": { "type": "string", "description": "Short, concrete subtask title" }
                },
                "required": ["task_id", "title"]
            }),
        },
        ToolDefinition {
            name: "set_task_parent".into(),
            description: "Moves a task under a different epic and/or user story, or clears \
                either back to none. epic_id/user_story_id must be real IDs — call list_epics \
                and/or list_user_stories first to find them, don't guess or invent one."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "ID of the task to move" },
                    "epic_id": { "type": ["string", "null"], "description": "New epic ID, or null to clear" },
                    "user_story_id": { "type": ["string", "null"], "description": "New user story ID, or null to clear" }
                },
                "required": ["id"]
            }),
        },
        ToolDefinition {
            name: "create_task".into(),
            description: "Creates a new task in a project. New tasks start in the \"todo\" \
                state. epic_id/user_story_id, if set, must be real IDs from list_epics/\
                list_user_stories — don't guess or invent one."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "string", "description": "Project to create the task in; defaults to the project currently open in the UI if omitted" },
                    "title": { "type": "string" },
                    "description": { "type": ["string", "null"] },
                    "epic_id": { "type": ["string", "null"] },
                    "user_story_id": { "type": ["string", "null"] },
                    "priority": { "type": ["string", "null"], "enum": ["low", "medium", "high", null] }
                },
                "required": ["title"]
            }),
        },
        ToolDefinition {
            name: "update_task".into(),
            description: "Updates fields on an existing task. Omitted fields are left \
                unchanged. epic_id/user_story_id, if set, must be real IDs from list_epics/\
                list_user_stories — don't guess or invent one."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": ["string", "null"] },
                    "description": { "type": ["string", "null"] },
                    "priority": { "type": ["string", "null"], "enum": ["low", "medium", "high", null] },
                    "epic_id": { "type": ["string", "null"] },
                    "user_story_id": { "type": ["string", "null"] }
                },
                "required": ["id"]
            }),
        },
        ToolDefinition {
            name: "move_task_state".into(),
            description: "Moves a task to a different board column (state).".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "new_state": { "type": "string", "enum": ["todo", "doing", "under_review", "done"] }
                },
                "required": ["id", "new_state"]
            }),
        },
        ToolDefinition {
            name: "archive_task".into(),
            description: "Archives a task, removing it from active views without deleting it."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }),
        },
        ToolDefinition {
            name: "list_tasks".into(),
            description: "Lists the active (non-archived) tasks in a project, with their tags \
                and blocked status."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "string", "description": "Defaults to the project currently open in the UI if omitted" }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "get_task_details".into(),
            description: "Fetches a single task's full detail: its fields, subtasks, tags, and \
                the tasks that block it."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }),
        },
        ToolDefinition {
            name: "list_projects".into(),
            description: "Lists the active (non-archived) projects in a workspace.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string", "description": "Defaults to the workspace currently open in the UI if omitted" }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "list_tags".into(),
            description: "Lists every tag that exists (tags are global, not scoped to a \
                project). Call this before set_task_tags to find the real tag IDs that match \
                what the user asked for — never invent a tag ID."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolDefinition {
            name: "list_epics".into(),
            description: "Lists the epics in a project. Call this before set_task_parent, \
                create_task, or update_task when the user refers to an epic by name, to find \
                its real ID — never invent one."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "string", "description": "Defaults to the project currently open in the UI if omitted" }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "list_user_stories".into(),
            description: "Lists the user stories in a project. Call this before \
                set_task_parent, create_task, or update_task when the user refers to a user \
                story by name, to find its real ID — never invent one."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "string", "description": "Defaults to the project currently open in the UI if omitted" }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "set_task_tags".into(),
            description: "Replaces a task's full set of tags with the given list of tag IDs. \
                Call list_tags first to resolve tag names to real IDs — never invent one."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "task_id": { "type": "string" },
                    "tag_ids": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["task_id", "tag_ids"]
            }),
        },
        ToolDefinition {
            name: "set_deadline".into(),
            description: "Sets a task's deadline, either an exact date or a fuzzy bucket \
                (loosely \"sometime this week/month/quarter\", helpful when an exact date isn't \
                known or would be stressful to commit to)."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "deadline_type": { "type": "string", "enum": ["exact", "fuzzy"] },
                    "exact_date": { "type": ["string", "null"], "description": "Required (YYYY-MM-DD) when deadline_type = exact" },
                    "fuzzy_bucket": { "type": ["string", "null"], "enum": ["this_week", "this_month", "this_quarter", "someday", null], "description": "Required when deadline_type = fuzzy" }
                },
                "required": ["id", "deadline_type"]
            }),
        },
    ]
}

#[derive(Deserialize)]
struct AddSubtaskArgs {
    task_id: String,
    title: String,
}

#[derive(Deserialize)]
struct SetTaskParentArgs {
    id: String,
    epic_id: Option<String>,
    user_story_id: Option<String>,
}

#[derive(Deserialize)]
struct CreateTaskArgs {
    project_id: String,
    title: String,
    description: Option<String>,
    epic_id: Option<String>,
    user_story_id: Option<String>,
    priority: Option<String>,
}

#[derive(Deserialize)]
struct UpdateTaskArgs {
    id: String,
    title: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    epic_id: Option<String>,
    user_story_id: Option<String>,
}

#[derive(Deserialize)]
struct MoveTaskStateArgs {
    id: String,
    new_state: String,
}

#[derive(Deserialize)]
struct ArchiveTaskArgs {
    id: String,
}

#[derive(Deserialize)]
struct ListTasksArgs {
    project_id: String,
}

#[derive(Deserialize)]
struct GetTaskDetailsArgs {
    id: String,
}

#[derive(Deserialize)]
struct ListProjectsArgs {
    workspace_id: String,
}

#[derive(Deserialize)]
struct ListEpicsArgs {
    project_id: String,
}

#[derive(Deserialize)]
struct ListUserStoriesArgs {
    project_id: String,
}

#[derive(Deserialize)]
struct SetTaskTagsArgs {
    task_id: String,
    tag_ids: Vec<String>,
}

#[derive(Deserialize)]
struct SetDeadlineArgs {
    id: String,
    deadline_type: String,
    exact_date: Option<String>,
    fuzzy_bucket: Option<String>,
}

fn parse_args<T: DeserializeOwned>(args: Value) -> AppResult<T> {
    serde_json::from_value(args)
        .map_err(|e| AppError::Invalid(format!("invalid tool arguments: {e}")))
}

fn to_value<T: Serialize>(value: T) -> AppResult<Value> {
    serde_json::to_value(value)
        .map_err(|e| AppError::Invalid(format!("failed to serialize tool result: {e}")))
}

/// Fills in `project_id`/`workspace_id` on a tool call's arguments from
/// `ctx` when the AI left them out — tools that don't take those fields
/// simply ignore the extra keys during deserialization.
fn merge_context(args: Value, ctx: &ToolContext) -> Value {
    let mut obj = match args {
        Value::Object(obj) => obj,
        _ => serde_json::Map::new(),
    };
    if let Some(project_id) = &ctx.project_id {
        obj.entry("project_id").or_insert_with(|| json!(project_id));
    }
    if let Some(workspace_id) = &ctx.workspace_id {
        obj.entry("workspace_id")
            .or_insert_with(|| json!(workspace_id));
    }
    Value::Object(obj)
}

/// Maps AI tool calls onto the same command functions
/// `src-tauri/src/commands` exposes over Tauri's IPC — this *is* the
/// "ToolRegistry" from the roadmap.
pub struct CommandToolExecutor;

/// Wraps a tool result with no logged action — the common case for
/// read-only tools.
fn unlogged(value: AppResult<Value>) -> AppResult<ToolExecutionResult> {
    Ok(ToolExecutionResult {
        value: value?,
        logged_action: None,
    })
}

impl ToolExecutor for CommandToolExecutor {
    fn execute(
        &self,
        call: &ToolCall,
        ctx: &ToolContext,
        db: &AppState,
    ) -> AppResult<ToolExecutionResult> {
        let args = merge_context(call.arguments.clone(), ctx);
        let mut conn = db.conn()?;

        match call.name.as_str() {
            "add_subtask" => {
                let a: AddSubtaskArgs = parse_args(args)?;
                let subtask = tasks::insert_subtask(&conn, a.task_id.clone(), a.title.clone())?;
                let logged = ai_log::record(
                    &conn,
                    "add_subtask",
                    &call.arguments,
                    format!("Added subtask \"{}\"", a.title),
                    Some(a.task_id),
                    None,
                )?;
                Ok(ToolExecutionResult {
                    value: to_value(subtask)?,
                    logged_action: Some(logged),
                })
            }
            "set_task_parent" => {
                let a: SetTaskParentArgs = parse_args(args)?;
                let before = tasks::get(&conn, &a.id)?;
                let updated = tasks::set_parent(&conn, a.id.clone(), a.epic_id, a.user_story_id)?;
                let logged = ai_log::record(
                    &conn,
                    "set_task_parent",
                    &call.arguments,
                    format!("Changed parent of \"{}\"", before.title),
                    Some(a.id),
                    Some(&before),
                )?;
                Ok(ToolExecutionResult {
                    value: to_value(updated)?,
                    logged_action: Some(logged),
                })
            }
            "create_task" => {
                let a: CreateTaskArgs = parse_args(args)?;
                let title = a.title.clone();
                let created = tasks::create(
                    &conn,
                    a.project_id,
                    a.title,
                    a.description,
                    a.epic_id,
                    a.user_story_id,
                    a.priority,
                )?;
                let logged = ai_log::record(
                    &conn,
                    "create_task",
                    &call.arguments,
                    format!("Created task \"{title}\""),
                    Some(created.id.clone()),
                    None,
                )?;
                Ok(ToolExecutionResult {
                    value: to_value(created)?,
                    logged_action: Some(logged),
                })
            }
            "update_task" => {
                let a: UpdateTaskArgs = parse_args(args)?;
                let before = tasks::get(&conn, &a.id)?;
                let updated = tasks::update(
                    &conn,
                    a.id.clone(),
                    a.title,
                    a.description,
                    a.priority,
                    a.epic_id,
                    a.user_story_id,
                )?;
                let logged = ai_log::record(
                    &conn,
                    "update_task",
                    &call.arguments,
                    format!("Updated \"{}\"", before.title),
                    Some(a.id),
                    Some(&before),
                )?;
                Ok(ToolExecutionResult {
                    value: to_value(updated)?,
                    logged_action: Some(logged),
                })
            }
            "move_task_state" => {
                let a: MoveTaskStateArgs = parse_args(args)?;
                let before = tasks::get(&conn, &a.id)?;
                let updated = tasks::update_state(&mut conn, a.id.clone(), a.new_state.clone())?;
                let logged = ai_log::record(
                    &conn,
                    "move_task_state",
                    &call.arguments,
                    format!(
                        "Moved \"{}\" from {} to {}",
                        before.title, before.state, a.new_state
                    ),
                    Some(a.id),
                    Some(&before),
                )?;
                Ok(ToolExecutionResult {
                    value: to_value(updated)?,
                    logged_action: Some(logged),
                })
            }
            "archive_task" => {
                let a: ArchiveTaskArgs = parse_args(args)?;
                let before = tasks::get(&conn, &a.id)?;
                tasks::archive(&conn, a.id.clone())?;
                let logged = ai_log::record(
                    &conn,
                    "archive_task",
                    &call.arguments,
                    format!("Archived \"{}\"", before.title),
                    Some(a.id),
                    Some(&before),
                )?;
                Ok(ToolExecutionResult {
                    value: json!({ "archived": true }),
                    logged_action: Some(logged),
                })
            }
            "list_tasks" => {
                let a: ListTasksArgs = parse_args(args)?;
                unlogged(to_value(tasks::list(&conn, a.project_id)?))
            }
            "get_task_details" => {
                let a: GetTaskDetailsArgs = parse_args(args)?;
                unlogged(to_value(tasks::get_detail(&conn, a.id)?))
            }
            "list_projects" => {
                let a: ListProjectsArgs = parse_args(args)?;
                unlogged(to_value(projects::list(&conn, a.workspace_id)?))
            }
            "list_tags" => unlogged(to_value(tags::list(&conn)?)),
            "list_epics" => {
                let a: ListEpicsArgs = parse_args(args)?;
                unlogged(to_value(epics::list(&conn, a.project_id)?))
            }
            "list_user_stories" => {
                let a: ListUserStoriesArgs = parse_args(args)?;
                unlogged(to_value(user_stories::list(&conn, a.project_id)?))
            }
            "set_task_tags" => {
                let a: SetTaskTagsArgs = parse_args(args)?;
                let task_id = a.task_id.clone();
                tags::replace_task_tags(&mut conn, a.task_id, a.tag_ids)?;
                let logged = ai_log::record(
                    &conn,
                    "set_task_tags",
                    &call.arguments,
                    format!("Updated tags on task {task_id}"),
                    Some(task_id),
                    None,
                )?;
                Ok(ToolExecutionResult {
                    value: json!({ "ok": true }),
                    logged_action: Some(logged),
                })
            }
            "set_deadline" => {
                let a: SetDeadlineArgs = parse_args(args)?;
                let before = tasks::get(&conn, &a.id)?;
                let updated = tasks::apply_deadline(
                    &conn,
                    a.id.clone(),
                    a.deadline_type,
                    a.exact_date,
                    a.fuzzy_bucket,
                )?;
                let logged = ai_log::record(
                    &conn,
                    "set_deadline",
                    &call.arguments,
                    format!("Changed deadline of \"{}\"", before.title),
                    Some(a.id),
                    Some(&before),
                )?;
                Ok(ToolExecutionResult {
                    value: to_value(updated)?,
                    logged_action: Some(logged),
                })
            }
            other => Err(AppError::Invalid(format!("unknown tool {other:?}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::workspaces;
    use crate::db::{self, DbStatus};
    use std::sync::Mutex;

    fn test_db() -> AppState {
        AppState {
            db: Mutex::new(db::test_connection()),
            db_status: Mutex::new(DbStatus::NotConfigured),
        }
    }

    fn make_project(db: &AppState) -> String {
        let conn = db.conn().unwrap();
        let workspace_id = workspaces::create(&conn, "WS".into(), None, None)
            .unwrap()
            .id;
        projects::create(&conn, workspace_id, "Proj".into(), None)
            .unwrap()
            .id
    }

    #[test]
    fn create_task_fills_in_project_id_from_context_when_omitted() {
        let db = test_db();
        let project_id = make_project(&db);
        let ctx = ToolContext {
            project_id: Some(project_id.clone()),
            ..Default::default()
        };
        let executor = CommandToolExecutor;

        let call = ToolCall {
            id: "1".into(),
            name: "create_task".into(),
            arguments: json!({ "title": "Write tests" }),
        };

        let result = executor.execute(&call, &ctx, &db).unwrap();
        assert_eq!(result.value["project_id"], json!(project_id));
        assert_eq!(result.value["title"], json!("Write tests"));
        let logged = result.logged_action.unwrap();
        assert!(!logged.revertible);
        assert_eq!(logged.summary, "Created task \"Write tests\"");
    }

    #[test]
    fn explicit_project_id_in_call_arguments_wins_over_context() {
        let db = test_db();
        let context_project = make_project(&db);
        let explicit_project = make_project(&db);
        let ctx = ToolContext {
            project_id: Some(context_project),
            ..Default::default()
        };
        let executor = CommandToolExecutor;

        let call = ToolCall {
            id: "1".into(),
            name: "create_task".into(),
            arguments: json!({ "title": "Explicit", "project_id": explicit_project }),
        };

        let result = executor.execute(&call, &ctx, &db).unwrap();
        assert_eq!(result.value["project_id"], json!(explicit_project));
    }

    #[test]
    fn add_subtask_round_trips_through_the_real_command() {
        let db = test_db();
        let project_id = make_project(&db);
        let conn = db.conn().unwrap();
        let task =
            tasks::create(&conn, project_id, "Parent".into(), None, None, None, None).unwrap();
        drop(conn);

        let executor = CommandToolExecutor;
        let call = ToolCall {
            id: "1".into(),
            name: "add_subtask".into(),
            arguments: json!({ "task_id": task.id, "title": "Step 1" }),
        };

        let result = executor
            .execute(&call, &ToolContext::default(), &db)
            .unwrap();
        assert_eq!(result.value["title"], json!("Step 1"));
        assert_eq!(result.value["done"], json!(false));
        let logged = result.logged_action.unwrap();
        assert!(!logged.revertible, "add_subtask is not revertible");
    }

    #[test]
    fn list_tags_returns_every_tag_and_is_not_logged() {
        let db = test_db();
        let conn = db.conn().unwrap();
        tags::create(&conn, "urgent".into(), "#ff0000".into()).unwrap();
        drop(conn);

        let executor = CommandToolExecutor;
        let call = ToolCall {
            id: "1".into(),
            name: "list_tags".into(),
            arguments: json!({}),
        };

        let result = executor
            .execute(&call, &ToolContext::default(), &db)
            .unwrap();
        let names: Vec<&str> = result
            .value
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["urgent"]);
        assert!(result.logged_action.is_none());
    }

    #[test]
    fn list_epics_fills_in_project_id_from_context_when_omitted() {
        let db = test_db();
        let project_id = make_project(&db);
        let conn = db.conn().unwrap();
        epics::create(&conn, project_id.clone(), "Launch".into(), None).unwrap();
        drop(conn);
        let ctx = ToolContext {
            project_id: Some(project_id),
            ..Default::default()
        };

        let executor = CommandToolExecutor;
        let call = ToolCall {
            id: "1".into(),
            name: "list_epics".into(),
            arguments: json!({}),
        };

        let result = executor.execute(&call, &ctx, &db).unwrap();
        assert_eq!(result.value[0]["title"], json!("Launch"));
    }

    #[test]
    fn list_user_stories_fills_in_project_id_from_context_when_omitted() {
        let db = test_db();
        let project_id = make_project(&db);
        let conn = db.conn().unwrap();
        user_stories::create(&conn, project_id.clone(), None, "As a user...".into(), None).unwrap();
        drop(conn);
        let ctx = ToolContext {
            project_id: Some(project_id),
            ..Default::default()
        };

        let executor = CommandToolExecutor;
        let call = ToolCall {
            id: "1".into(),
            name: "list_user_stories".into(),
            arguments: json!({}),
        };

        let result = executor.execute(&call, &ctx, &db).unwrap();
        assert_eq!(result.value[0]["title"], json!("As a user..."));
    }

    #[test]
    fn unknown_tool_name_is_rejected() {
        let db = test_db();
        let executor = CommandToolExecutor;
        let call = ToolCall {
            id: "1".into(),
            name: "delete_everything".into(),
            arguments: json!({}),
        };

        let err = executor
            .execute(&call, &ToolContext::default(), &db)
            .unwrap_err();
        assert!(matches!(err, AppError::Invalid(_)));
    }

    #[test]
    fn toolbox_names_are_unique_and_nonempty() {
        let tools = toolbox();
        assert!(!tools.is_empty());
        let mut names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        names.sort();
        names.dedup();
        assert_eq!(names.len(), tools.len());
    }

    /// Covers the roadmap's specific "risky 5": each must log with a
    /// before-state snapshot (`revertible: true`), matching what the
    /// user flagged as needing a safety net.
    #[test]
    fn the_five_task_mutating_tools_log_a_revertible_action() {
        let db = test_db();
        let project_id = make_project(&db);
        let conn = db.conn().unwrap();
        let task = tasks::create(
            &conn,
            project_id.clone(),
            "T".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        drop(conn);
        let executor = CommandToolExecutor;
        let ctx = ToolContext::default();

        let cases: Vec<(&str, serde_json::Value)> = vec![
            ("update_task", json!({ "id": task.id, "title": "Renamed" })),
            (
                "move_task_state",
                json!({ "id": task.id, "new_state": "doing" }),
            ),
            ("set_task_parent", json!({ "id": task.id, "epic_id": null })),
            (
                "set_deadline",
                json!({ "id": task.id, "deadline_type": "fuzzy", "fuzzy_bucket": "this_week" }),
            ),
            ("archive_task", json!({ "id": task.id })),
        ];

        for (name, arguments) in cases {
            let call = ToolCall {
                id: "1".into(),
                name: name.into(),
                arguments,
            };
            let result = executor.execute(&call, &ctx, &db).unwrap();
            let logged = result
                .logged_action
                .unwrap_or_else(|| panic!("{name} should log an action"));
            assert!(logged.revertible, "{name} should be revertible");
            assert_eq!(logged.task_id.as_deref(), Some(task.id.as_str()));
        }
    }

    #[test]
    fn set_task_tags_logs_a_non_revertible_action() {
        let db = test_db();
        let project_id = make_project(&db);
        let conn = db.conn().unwrap();
        let task = tasks::create(&conn, project_id, "T".into(), None, None, None, None).unwrap();
        drop(conn);
        let executor = CommandToolExecutor;

        let call = ToolCall {
            id: "1".into(),
            name: "set_task_tags".into(),
            arguments: json!({ "task_id": task.id, "tag_ids": [] }),
        };

        let result = executor
            .execute(&call, &ToolContext::default(), &db)
            .unwrap();
        let logged = result.logged_action.unwrap();
        assert!(!logged.revertible);
    }
}
