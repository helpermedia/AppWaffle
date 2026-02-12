mod app_discovery;
mod commands;
mod config;
mod icon_cache;
mod window;

use serde::Serialize;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Manager, WindowEvent};

#[derive(Debug, thiserror::Error)]
pub(crate) enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Tauri(#[from] tauri::Error),
    #[error("{0}")]
    Validation(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Flag to prevent focus-loss close during app launch animation
pub(crate) static IS_LAUNCHING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Save order state to disk and exit
pub(crate) fn graceful_exit(app: &tauri::AppHandle) {
    if let Err(e) = config::save_order_to_disk() {
        eprintln!("Failed to save order: {}", e);
    }
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Create custom menu with proper capitalization
            let about = PredefinedMenuItem::about(
                app,
                Some("About AppWaffle"),
                Some(AboutMetadata::default()),
            )?;
            let quit = MenuItem::with_id(
                app,
                "quit",
                "Quit AppWaffle",
                true,
                Some("CmdOrCtrl+Q"),
            )?;
            let app_menu = Submenu::with_items(
                app,
                "AppWaffle",
                true,
                &[&about, &PredefinedMenuItem::separator(app)?, &quit],
            )?;
            let menu = Menu::with_items(app, &[&app_menu])?;
            app.set_menu(menu)?;

            let main_window = app
                .get_webview_window("main")
                .expect("main webview window not found");

            #[cfg(target_os = "macos")]
            {
                window::setup_window(&main_window);
                // Window starts hidden - frontend calls show_window after content is ready
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_apps,
            commands::get_app_icon,
            commands::launch_app,
            commands::show_window,
            commands::load_config,
            commands::update_order,
            commands::quit_app,
            commands::quit_after_delay,
        ])
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                graceful_exit(app);
            }
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(false) => {
                // Skip focus-loss close during app launch/close animation
                if IS_LAUNCHING.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                // Close when losing focus (like real Launchpad)
                // Use same delay as other close actions for consistent feel
                IS_LAUNCHING.store(true, std::sync::atomic::Ordering::SeqCst);
                let app = window.app_handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    graceful_exit(&app);
                });
            }
            WindowEvent::CloseRequested { .. } => {
                graceful_exit(window.app_handle());
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
