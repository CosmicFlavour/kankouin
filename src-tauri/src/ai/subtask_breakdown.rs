use serde_json::Value;

use crate::commands::tasks;
use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::TaskDetail;

use super::registry;
use super::{
    run_tool_loop, AIProvider, ChatMessage, ChatTurnResult, ToolCall, ToolContext, ToolDefinition,
    ToolExecutionResult, ToolExecutor,
};

/// The task panel's "Break into subtasks" button. Deliberately *not* the
/// conversational assistant's configurable system prompt
/// (`super::effective_system_prompt`) — this is a narrow, single-purpose
/// action with its own fixed instruction that has nothing to do with the
/// user's chat persona. Tweak this constant (and `describe_task` below,
/// for what the model is told about the task) to change what the button
/// actually does; nothing else in the app reads either.
const BREAKDOWN_PROMPT: &str = "\
Break this task into small, concrete, actionable subtasks using the add_subtask tool. \
Use the same language as the task title. Don't repeat subtasks that already exist.";

/// The only tool this action may call — deliberately not the full
/// `registry::toolbox()` a chat turn gets, since this runs unsupervised
/// (no back-and-forth for the user to catch a wrong tool call before it
/// executes).
const ALLOWED_TOOL: &str = "add_subtask";

/// Tells the model about the one task it's allowed to touch: its title
/// (also so the reply matches the title's language), description if any,
/// and existing subtask titles so it doesn't repeat them. Deliberately
/// excludes everything else on the task (tags, priority, deadline,
/// state) — none of it is relevant to breaking the task into steps.
fn describe_task(task: &TaskDetail) -> String {
    let mut lines = vec![format!("Task title: {}", task.task.title)];
    if let Some(description) = &task.task.description {
        if !description.trim().is_empty() {
            lines.push(format!("Description: {description}"));
        }
    }
    if task.subtasks.is_empty() {
        lines.push("Existing subtasks: none".into());
    } else {
        let titles: Vec<&str> = task.subtasks.iter().map(|s| s.title.as_str()).collect();
        lines.push(format!("Existing subtasks: {}", titles.join("; ")));
    }
    lines.join("\n")
}

/// Wraps the real executor so the model (a) can only ever call
/// `add_subtask`, and (b) can't target any task but the one the button
/// was clicked on. `task_id` in the arguments is overwritten, not merely
/// defaulted like `registry::merge_context` does for the chat tools — so
/// even a hallucinated id can't do anything.
struct SubtaskOnlyExecutor<'a> {
    inner: &'a dyn ToolExecutor,
    task_id: &'a str,
}

impl ToolExecutor for SubtaskOnlyExecutor<'_> {
    fn execute(
        &self,
        call: &ToolCall,
        ctx: &ToolContext,
        db: &AppState,
    ) -> AppResult<ToolExecutionResult> {
        if call.name != ALLOWED_TOOL {
            return Err(AppError::Invalid(format!(
                "the AI attempted to call {:?}, which isn't allowed for this action",
                call.name
            )));
        }
        let mut args = match call.arguments.clone() {
            Value::Object(obj) => obj,
            _ => serde_json::Map::new(),
        };
        args.insert("task_id".into(), Value::String(self.task_id.to_string()));
        let pinned_call = ToolCall {
            arguments: Value::Object(args),
            ..call.clone()
        };
        self.inner.execute(&pinned_call, ctx, db)
    }
}

/// Entry point for the task panel's "Break into subtasks" button. Builds
/// its own throwaway history (just the instruction plus this one task's
/// details) and never touches `AIChatOrchestrator`'s conversation, so it
/// can't interleave with — or be derailed by — whatever's open in the
/// chat sidebar, and nothing about it shows up in the chat transcript.
/// The `add_subtask` calls it makes are still logged to the DB-backed
/// action log like any other tool call, though, so they *do* show up in
/// the Actions tab.
pub fn break_into_subtasks(
    provider: &dyn AIProvider,
    executor: &dyn ToolExecutor,
    db: &AppState,
    task_id: String,
) -> AppResult<ChatTurnResult> {
    let task = {
        let conn = db.conn()?;
        tasks::get_detail(&conn, task_id.clone())?
    };

    let tools: Vec<ToolDefinition> = registry::toolbox()
        .into_iter()
        .filter(|t| t.name == ALLOWED_TOOL)
        .collect();
    let scoped_executor = SubtaskOnlyExecutor {
        inner: executor,
        task_id: &task_id,
    };
    let ctx = ToolContext {
        project_id: Some(task.task.project_id.clone()),
        ..Default::default()
    };

    let mut history = vec![
        ChatMessage::system(BREAKDOWN_PROMPT),
        ChatMessage::user(describe_task(&task)),
    ];

    run_tool_loop(provider, &scoped_executor, &tools, &ctx, db, &mut history)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{AIResponse, ChatRole};
    use crate::commands::{projects, workspaces};
    use crate::db::{self, DbStatus};
    use serde_json::json;
    use std::sync::Mutex;

    fn test_db() -> AppState {
        AppState {
            db: Mutex::new(db::test_connection()),
            db_status: Mutex::new(DbStatus::NotConfigured),
        }
    }

    fn make_task(db: &AppState) -> String {
        let conn = db.conn().unwrap();
        let workspace_id = workspaces::create(&conn, "WS".into(), None, None)
            .unwrap()
            .id;
        let project_id = projects::create(&conn, workspace_id, "Proj".into(), None)
            .unwrap()
            .id;
        tasks::create(
            &conn,
            project_id,
            "Plan the launch".into(),
            Some("Coordinate marketing and eng".into()),
            None,
            None,
            None,
        )
        .unwrap()
        .id
    }

    /// Returns the scripted tool calls on the first turn, then a plain
    /// message once a tool result is in the history — just enough to
    /// drive `run_tool_loop` through exactly one round.
    struct ScriptedProvider {
        calls: Vec<ToolCall>,
    }

    impl AIProvider for ScriptedProvider {
        fn id(&self) -> &str {
            "scripted"
        }

        fn send(
            &self,
            messages: &[ChatMessage],
            _tools: &[ToolDefinition],
        ) -> AppResult<AIResponse> {
            let already_ran = messages.iter().any(|m| m.role == ChatRole::Tool);
            if already_ran {
                Ok(AIResponse::Message("Done.".into()))
            } else {
                Ok(AIResponse::ToolCalls(self.calls.clone()))
            }
        }
    }

    #[test]
    fn describe_task_lists_title_description_and_existing_subtasks() {
        let db = test_db();
        let task_id = make_task(&db);
        let conn = db.conn().unwrap();
        tasks::insert_subtask(&conn, task_id.clone(), "Book venue".into()).unwrap();
        drop(conn);
        let conn = db.conn().unwrap();
        let detail = tasks::get_detail(&conn, task_id).unwrap();

        let description = describe_task(&detail);
        assert!(description.contains("Plan the launch"));
        assert!(description.contains("Coordinate marketing and eng"));
        assert!(description.contains("Book venue"));
    }

    #[test]
    fn describe_task_reports_no_existing_subtasks_when_there_are_none() {
        let db = test_db();
        let task_id = make_task(&db);
        let conn = db.conn().unwrap();
        let detail = tasks::get_detail(&conn, task_id).unwrap();

        assert!(describe_task(&detail).contains("Existing subtasks: none"));
    }

    #[test]
    fn creates_a_subtask_via_the_add_subtask_tool_pinning_the_real_task_id() {
        let db = test_db();
        let task_id = make_task(&db);
        let provider = ScriptedProvider {
            calls: vec![ToolCall {
                id: "1".into(),
                name: "add_subtask".into(),
                arguments: json!({ "task_id": "wrong-id", "title": "Book venue" }),
            }],
        };
        let executor = registry::CommandToolExecutor;

        let result = break_into_subtasks(&provider, &executor, &db, task_id.clone()).unwrap();

        assert_eq!(result.actions.len(), 1);
        let conn = db.conn().unwrap();
        let detail = tasks::get_detail(&conn, task_id).unwrap();
        // The scripted call targeted "wrong-id" — the executor pins
        // task_id to the real one regardless, so it lands correctly.
        assert_eq!(detail.subtasks.len(), 1);
        assert_eq!(detail.subtasks[0].title, "Book venue");
    }

    #[test]
    fn rejects_a_tool_call_outside_the_allow_list() {
        let db = test_db();
        let task_id = make_task(&db);
        let provider = ScriptedProvider {
            calls: vec![ToolCall {
                id: "1".into(),
                name: "archive_task".into(),
                arguments: json!({ "id": task_id }),
            }],
        };
        let executor = registry::CommandToolExecutor;

        let err = break_into_subtasks(&provider, &executor, &db, task_id.clone()).unwrap_err();
        assert!(matches!(err, AppError::Invalid(_)));

        let conn = db.conn().unwrap();
        let detail = tasks::get_detail(&conn, task_id).unwrap();
        assert!(
            !detail.task.archived,
            "the disallowed call must not have run"
        );
    }

    #[test]
    fn only_advertises_the_add_subtask_tool_to_the_provider() {
        struct RecordingProvider {
            seen_tools: Mutex<Vec<String>>,
        }
        impl AIProvider for RecordingProvider {
            fn id(&self) -> &str {
                "recording"
            }
            fn send(
                &self,
                _messages: &[ChatMessage],
                tools: &[ToolDefinition],
            ) -> AppResult<AIResponse> {
                *self.seen_tools.lock().unwrap() = tools.iter().map(|t| t.name.clone()).collect();
                Ok(AIResponse::Message("ok".into()))
            }
        }

        let db = test_db();
        let task_id = make_task(&db);
        let provider = RecordingProvider {
            seen_tools: Mutex::new(Vec::new()),
        };
        let executor = registry::CommandToolExecutor;
        break_into_subtasks(&provider, &executor, &db, task_id).unwrap();

        assert_eq!(
            *provider.seen_tools.lock().unwrap(),
            vec!["add_subtask".to_string()]
        );
    }
}
