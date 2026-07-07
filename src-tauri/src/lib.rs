pub mod commands;
mod dates;
pub mod db;
pub mod error;
mod models;

use db::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = db::init_db(app.handle())?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::workspaces::list_workspaces,
            commands::workspaces::create_workspace,
            commands::workspaces::update_workspace,
            commands::workspaces::delete_workspace,
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::archive_project,
            commands::epics::list_epics,
            commands::epics::create_epic,
            commands::epics::update_epic,
            commands::epics::delete_epic,
            commands::user_stories::list_user_stories,
            commands::user_stories::create_user_story,
            commands::user_stories::update_user_story,
            commands::user_stories::delete_user_story,
            commands::tags::list_tags,
            commands::tags::create_tag,
            commands::tags::delete_tag,
            commands::tags::set_task_tags,
            commands::tags::list_tasks_by_tag,
            commands::tasks::list_tasks,
            commands::tasks::get_task,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::update_task_state,
            commands::tasks::set_deadline,
            commands::tasks::archive_task,
            commands::tasks::list_tasks_today,
            commands::tasks::list_ready_to_work_on,
            commands::tasks::add_subtask,
            commands::tasks::toggle_subtask,
            commands::tasks::add_log_entry,
            commands::tasks::set_dependency,
            commands::tasks::remove_dependency,
            commands::daily_review::get_stale_tasks,
            commands::sync::export_encrypted,
            commands::sync::import_encrypted,
            commands::sync::get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
