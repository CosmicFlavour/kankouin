use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::commands::{projects, tags, tasks};
use crate::db::AppState;
use crate::error::{AppError, AppResult};

use super::{ToolCall, ToolContext, ToolDefinition, ToolExecutor};

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
                either back to none."
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
                state."
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
                unchanged."
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
            name: "set_task_tags".into(),
            description: "Replaces a task's full set of tags with the given list of tag IDs."
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

impl ToolExecutor for CommandToolExecutor {
    fn execute(&self, call: &ToolCall, ctx: &ToolContext, db: &AppState) -> AppResult<Value> {
        let args = merge_context(call.arguments.clone(), ctx);
        let mut conn = db.conn()?;

        match call.name.as_str() {
            "add_subtask" => {
                let a: AddSubtaskArgs = parse_args(args)?;
                to_value(tasks::insert_subtask(&conn, a.task_id, a.title)?)
            }
            "set_task_parent" => {
                let a: SetTaskParentArgs = parse_args(args)?;
                to_value(tasks::set_parent(&conn, a.id, a.epic_id, a.user_story_id)?)
            }
            "create_task" => {
                let a: CreateTaskArgs = parse_args(args)?;
                to_value(tasks::create(
                    &conn,
                    a.project_id,
                    a.title,
                    a.description,
                    a.epic_id,
                    a.user_story_id,
                    a.priority,
                )?)
            }
            "update_task" => {
                let a: UpdateTaskArgs = parse_args(args)?;
                to_value(tasks::update(
                    &conn,
                    a.id,
                    a.title,
                    a.description,
                    a.priority,
                    a.epic_id,
                    a.user_story_id,
                )?)
            }
            "move_task_state" => {
                let a: MoveTaskStateArgs = parse_args(args)?;
                to_value(tasks::update_state(&mut conn, a.id, a.new_state)?)
            }
            "archive_task" => {
                let a: ArchiveTaskArgs = parse_args(args)?;
                tasks::archive(&conn, a.id)?;
                Ok(json!({ "archived": true }))
            }
            "list_tasks" => {
                let a: ListTasksArgs = parse_args(args)?;
                to_value(tasks::list(&conn, a.project_id)?)
            }
            "get_task_details" => {
                let a: GetTaskDetailsArgs = parse_args(args)?;
                to_value(tasks::get_detail(&conn, a.id)?)
            }
            "list_projects" => {
                let a: ListProjectsArgs = parse_args(args)?;
                to_value(projects::list(&conn, a.workspace_id)?)
            }
            "set_task_tags" => {
                let a: SetTaskTagsArgs = parse_args(args)?;
                tags::replace_task_tags(&mut conn, a.task_id, a.tag_ids)?;
                Ok(json!({ "ok": true }))
            }
            "set_deadline" => {
                let a: SetDeadlineArgs = parse_args(args)?;
                to_value(tasks::apply_deadline(
                    &conn,
                    a.id,
                    a.deadline_type,
                    a.exact_date,
                    a.fuzzy_bucket,
                )?)
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
            workspace_id: None,
        };
        let executor = CommandToolExecutor;

        let call = ToolCall {
            id: "1".into(),
            name: "create_task".into(),
            arguments: json!({ "title": "Write tests" }),
        };

        let result = executor.execute(&call, &ctx, &db).unwrap();
        assert_eq!(result["project_id"], json!(project_id));
        assert_eq!(result["title"], json!("Write tests"));
    }

    #[test]
    fn explicit_project_id_in_call_arguments_wins_over_context() {
        let db = test_db();
        let context_project = make_project(&db);
        let explicit_project = make_project(&db);
        let ctx = ToolContext {
            project_id: Some(context_project),
            workspace_id: None,
        };
        let executor = CommandToolExecutor;

        let call = ToolCall {
            id: "1".into(),
            name: "create_task".into(),
            arguments: json!({ "title": "Explicit", "project_id": explicit_project }),
        };

        let result = executor.execute(&call, &ctx, &db).unwrap();
        assert_eq!(result["project_id"], json!(explicit_project));
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
        assert_eq!(result["title"], json!("Step 1"));
        assert_eq!(result["done"], json!(false));
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
}
