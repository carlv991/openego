// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Initialize database on startup
            let app_handle = app.handle().clone();
            
            // Initialize synchronously
            match openego_lib::database::Database::new(&app_handle) {
                Ok(db) => {
                    let state: tauri::State<openego_lib::commands::AppState> = app_handle.state();
                    let mut db_lock = state.db.lock().unwrap();
                    *db_lock = Some(db);
                    println!("✅ Database initialized successfully");
                }
                Err(e) => {
                    eprintln!("❌ Failed to initialize database: {}", e);
                }
            }
            
            // Setup system tray
            let show_i = MenuItem::with_id(app, "show", "Show OpenEgo", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let mode_i = MenuItem::with_id(app, "mode", "Mode: Co-Pilot", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &mode_i, &quit_i])?;
            
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "mode" => {
                            // Toggle between modes
                            println!("Mode toggled");
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            
            // Request notification permissions on startup
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_notification::NotificationExt;
                let _ = app.notification().request_permission();
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Database commands
            openego_lib::commands::save_user,
            openego_lib::commands::get_user,
            openego_lib::commands::save_permissions,
            openego_lib::commands::get_permissions,
            
            // Gmail API commands
            openego_lib::commands::authenticate_gmail,
            openego_lib::commands::fetch_gmail_messages,
            openego_lib::commands::get_gmail_auth_url,
            
            // Data ingestion
            openego_lib::commands::start_data_ingestion,
            openego_lib::commands::get_ingestion_progress,
            
            // Learning
            openego_lib::commands::start_learning,
            openego_lib::commands::get_learning_progress,
            
            // Response generation
            openego_lib::commands::generate_response,
            openego_lib::commands::calculate_confidence,
            
            // System
            openego_lib::commands::check_data_sources,
            openego_lib::commands::get_system_status,
            
            // Todo commands
            openego_lib::commands::create_todo,
            openego_lib::commands::get_todos,
            openego_lib::commands::update_todo_status,
            openego_lib::commands::delete_todo,
            openego_lib::commands::get_todo_stats,
            openego_lib::commands::open_related_item,
            
            // Notification commands
            openego_lib::commands::send_notification,
            openego_lib::commands::request_notification_permission,
            openego_lib::commands::is_notification_allowed,
            openego_lib::commands::get_background_status,
            openego_lib::commands::toggle_auto_pilot,
            
            // Pattern detection commands
            openego_lib::commands::detect_tasks_from_email,
            openego_lib::commands::auto_process_email,
            openego_lib::commands::get_suggested_response,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
