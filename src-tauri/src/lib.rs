use tauri::{AppHandle, Manager};

pub mod commands;
pub mod database;
pub mod gmail;
pub mod patterns;

use commands::AppState;
use database::Database;
use std::sync::Mutex;

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(None),
        })
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle();
            match Database::new(&app_handle) {
                Ok(db) => {
                    let state: tauri::State<AppState> = app_handle.state();
                    let mut db_lock = state.db.lock().unwrap();
                    *db_lock = Some(db);
                    println!("✅ Database initialized successfully");
                }
                Err(e) => {
                    eprintln!("❌ Failed to initialize database: {}", e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // User commands
            commands::save_user,
            commands::get_user,
            
            // Permission commands
            commands::save_permissions,
            commands::get_permissions,
            
            // Gmail commands
            commands::get_gmail_auth_url,
            commands::authenticate_gmail,
            commands::fetch_gmail_messages,
            
            // Data ingestion
            commands::start_data_ingestion,
            commands::get_ingestion_progress,
            
            // Learning
            commands::start_learning,
            commands::get_learning_progress,
            
            // Response generation
            commands::generate_response,
            commands::calculate_confidence,
            
            // System
            commands::check_data_sources,
            commands::get_system_status,
            
            // Todo commands
            commands::create_todo,
            commands::get_todos,
            commands::update_todo_status,
            commands::delete_todo,
            commands::get_todo_stats,
            commands::open_related_item,
            
            // Notification commands
            commands::send_notification,
            commands::request_notification_permission,
            commands::is_notification_allowed,
            commands::get_background_status,
            commands::toggle_auto_pilot,
            
            // Pattern detection commands
            commands::detect_tasks_from_email,
            commands::auto_process_email,
            commands::get_suggested_response,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub async fn init_database(app_handle: AppHandle) -> Result<(), String> {
    match Database::new(&app_handle) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Database initialization failed: {}", e)),
    }
}
