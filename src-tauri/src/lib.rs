use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Manager;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "macos")]
use objc2::{msg_send, runtime::AnyObject, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplication, NSApplicationPresentationOptions, NSScreen, NSWindow};
#[cfg(target_os = "macos")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
}

fn get_applications_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![PathBuf::from("/Applications")];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Applications"));
    }
    dirs
}

fn discover_apps() -> Vec<PathBuf> {
    let mut apps = Vec::new();

    for dir in get_applications_dirs() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "app") {
                    apps.push(path);
                }
            }
        }
    }

    apps.sort_by(|a, b| {
        a.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(
                &b.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });

    apps
}

/// Get icons cache directory
fn get_icons_cache_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join("com.appwaffle").join("icons"))
}

/// Get a stable hash for an app path to use as icon filename
fn get_icon_filename(app_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    app_path.hash(&mut hasher);
    format!("{:x}.png", hasher.finish())
}

/// Get cached icon path if it exists
fn get_cached_icon_path(app_path: &str) -> Option<PathBuf> {
    let icons_dir = get_icons_cache_dir()?;
    let icon_file = icons_dir.join(get_icon_filename(app_path));
    if icon_file.exists() {
        Some(icon_file)
    } else {
        None
    }
}

/// Save icon PNG bytes to cache and return the file path
fn save_icon_to_cache(app_path: &str, png_bytes: &[u8]) -> Option<PathBuf> {
    let icons_dir = get_icons_cache_dir()?;
    fs::create_dir_all(&icons_dir).ok()?;
    let icon_file = icons_dir.join(get_icon_filename(app_path));
    fs::write(&icon_file, png_bytes).ok()?;
    Some(icon_file)
}

/// Get icon using NSWorkspace via Swift (handles all icon types on macOS)
#[cfg(target_os = "macos")]
fn get_icon_nsworkspace_bytes(app_path: &str) -> Option<Vec<u8>> {
    let swift_code = format!(
        r#"
import Cocoa
import Foundation

let workspace = NSWorkspace.shared
let icon = workspace.icon(forFile: "{}")
icon.size = NSSize(width: 128, height: 128)

let cgImage = icon.cgImage(forProposedRect: nil, context: nil, hints: nil)!
let bitmap = NSBitmapImageRep(cgImage: cgImage)
let pngData = bitmap.representation(using: .png, properties: [:])!
print(pngData.base64EncodedString())
"#,
        app_path.replace("\"", "\\\"")
    );

    let output = Command::new("swift")
        .arg("-e")
        .arg(&swift_code)
        .output()
        .ok()?;

    if output.status.success() {
        let b64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !b64.is_empty() {
            return base64::engine::general_purpose::STANDARD.decode(&b64).ok();
        }
    }

    None
}

/// Get cached icon only (doesn't generate new icons)
fn get_icon_if_cached(app_path: &str) -> Option<String> {
    get_cached_icon_path(app_path).map(|p| format!("file://{}", p.display()))
}

/// Generate icon and save to cache, returns file:// URL
#[cfg(target_os = "macos")]
fn generate_and_cache_icon(app_path: &str) -> Option<String> {
    let png_bytes = get_icon_nsworkspace_bytes(app_path)?;
    let saved_path = save_icon_to_cache(app_path, &png_bytes)?;
    Some(format!("file://{}", saved_path.display()))
}

/// Generate icon for a single app (called from frontend for progressive loading)
#[tauri::command]
async fn get_app_icon(path: String) -> Option<String> {
    // Check cache first
    if let Some(cached) = get_icon_if_cached(&path) {
        return Some(cached);
    }
    // Generate if not cached
    #[cfg(target_os = "macos")]
    return generate_and_cache_icon(&path);
    #[cfg(not(target_os = "macos"))]
    None
}

/// Get all apps - returns instantly with cached icons (null for uncached)
#[tauri::command]
async fn get_apps() -> Result<Vec<AppInfo>, String> {
    let app_paths = discover_apps();

    let mut apps: Vec<AppInfo> = app_paths
        .into_iter()
        .filter_map(|path| {
            let name = path.file_stem()?.to_string_lossy().to_string();
            let path_str = path.to_string_lossy().to_string();
            let icon = get_icon_if_cached(&path_str);

            Some(AppInfo {
                name,
                path: path_str,
                icon,
            })
        })
        .collect();

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(apps)
}

#[tauri::command]
async fn launch_app(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to launch app: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn show_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Create custom menu with proper capitalization
            let about = PredefinedMenuItem::about(app, Some("About AppWaffle"), Some(AboutMetadata::default()))?;
            let quit = MenuItem::with_id(app, "quit", "Quit AppWaffle", true, Some("CmdOrCtrl+Q"))?;
            let app_menu = Submenu::with_items(app, "AppWaffle", true, &[&about, &PredefinedMenuItem::separator(app)?, &quit])?;
            let menu = Menu::with_items(app, &[&app_menu])?;
            app.set_menu(menu)?;
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            {
                let mtm = MainThreadMarker::new().expect("Must be on main thread");

                apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                    .expect("Failed to apply vibrancy");

                let app = NSApplication::sharedApplication(mtm);
                app.setPresentationOptions(NSApplicationPresentationOptions::AutoHideMenuBar);

                if let Some(screen) = NSScreen::mainScreen(mtm) {
                    let frame = screen.frame();

                    if let Ok(handle) = window.window_handle() {
                        if let RawWindowHandle::AppKit(appkit) = handle.as_raw() {
                            unsafe {
                                let ns_view = appkit.ns_view.as_ptr() as *mut AnyObject;
                                let ns_window: *mut NSWindow = msg_send![ns_view, window];

                                (*ns_window).setFrame_display(frame, true);
                                (*ns_window).setLevel(19);
                                (*ns_window).setHasShadow(false);
                            }
                        }
                    }
                }

                window.show().ok();
                window.set_focus().ok();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_apps, get_app_icon, launch_app, show_window])
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                app.exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
