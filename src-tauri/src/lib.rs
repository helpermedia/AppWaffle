use base64::Engine;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Manager, WindowEvent};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

/// In-memory order state - updated on every change, saved to disk only on exit
static ORDER_STATE: Mutex<Option<OrderConfig>> = Mutex::new(None);

/// Serializes disk writes so concurrent save_order_to_disk() calls don't interleave
static SAVE_LOCK: Mutex<()> = Mutex::new(());

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderInfo {
    pub name: String,
    pub path: String,
    pub apps: Vec<AppInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppsResponse {
    pub apps: Vec<AppInfo>,
    pub folders: Vec<FolderInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderMetadata {
    pub id: String,
    pub name: String,
    #[serde(rename = "appPaths")]
    pub app_paths: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OrderConfig {
    #[serde(default)]
    pub main: Vec<String>,
    #[serde(default)]
    pub folders: Vec<FolderMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    pub order: OrderConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            order: OrderConfig::default(),
        }
    }
}

fn get_applications_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Applications"));
    }
    dirs
}

fn sort_paths_by_name(paths: &mut [PathBuf]) {
    paths.sort_by(|a, b| {
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
}

fn get_apps_in_dir(dir: &PathBuf) -> Vec<PathBuf> {
    let mut apps = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "app") {
                apps.push(path);
            }
        }
    }
    sort_paths_by_name(&mut apps);
    apps
}

fn discover_apps_and_folders() -> (Vec<PathBuf>, Vec<(PathBuf, Vec<PathBuf>)>) {
    let mut apps = Vec::new();
    let mut folders: Vec<(PathBuf, Vec<PathBuf>)> = Vec::new();

    for dir in get_applications_dirs() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "app") {
                    apps.push(path);
                } else if path.is_dir() {
                    // Check for apps in subdirectory (1 level deep)
                    let sub_apps = get_apps_in_dir(&path);
                    if sub_apps.len() >= 2 {
                        // Only create folder if 2+ apps
                        folders.push((path, sub_apps));
                    } else if sub_apps.len() == 1 {
                        // Single app goes to main list
                        apps.extend(sub_apps);
                    }
                }
            }
        }
    }

    sort_paths_by_name(&mut apps);

    folders.sort_by(|a, b| {
        a.0.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(
                &b.0.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });

    (apps, folders)
}

/// Get icons cache directory
fn get_icons_cache_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join("com.helpermedia.appwaffle").join("icons"))
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
    let swift_code = r#"
import Cocoa
import Foundation

guard CommandLine.arguments.count > 1 else { exit(1) }
let path = CommandLine.arguments[1]
let workspace = NSWorkspace.shared
let icon = workspace.icon(forFile: path)
icon.size = NSSize(width: 128, height: 128)

let cgImage = icon.cgImage(forProposedRect: nil, context: nil, hints: nil)!
let bitmap = NSBitmapImageRep(cgImage: cgImage)
let pngData = bitmap.representation(using: .png, properties: [:])!
print(pngData.base64EncodedString())
"#;

    let output = Command::new("swift")
        .arg("-e")
        .arg(swift_code)
        .arg(app_path)
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

/// Get config directory: ~/Library/Application Support/com.helpermedia.appwaffle/
fn get_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("com.helpermedia.appwaffle"))
}

/// Get config file path: ~/Library/Application Support/com.helpermedia.appwaffle/config.json
fn get_config_path() -> Option<PathBuf> {
    get_config_dir().map(|p| p.join("config.json"))
}

/// Load app config from disk
#[tauri::command]
async fn load_config() -> Result<AppConfig, String> {
    let config_path = get_config_path()
        .ok_or_else(|| "Could not determine config directory".to_string())?;

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let contents = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse config: {}", e))
}

/// Update order in memory (called on every change from frontend)
/// Disk write happens only on window close for safety
#[tauri::command]
fn update_order(main: Vec<String>, folders: Vec<FolderMetadata>) -> Result<(), String> {
    const MAX_MAIN_ENTRIES: usize = 1000;
    const MAX_FOLDERS: usize = 200;
    const MAX_FOLDER_APPS: usize = 500;
    const MAX_STRING_LEN: usize = 1024;

    if main.len() > MAX_MAIN_ENTRIES {
        return Err("Too many main entries".to_string());
    }
    if folders.len() > MAX_FOLDERS {
        return Err("Too many folders".to_string());
    }
    if main.iter().any(|s| s.len() > MAX_STRING_LEN) {
        return Err("Main entry too long".to_string());
    }
    for folder in &folders {
        if folder.id.len() > MAX_STRING_LEN || folder.name.len() > MAX_STRING_LEN {
            return Err("Folder field too long".to_string());
        }
        if folder.app_paths.len() > MAX_FOLDER_APPS {
            return Err("Too many apps in folder".to_string());
        }
        if folder.app_paths.iter().any(|s| s.len() > MAX_STRING_LEN) {
            return Err("Folder app path too long".to_string());
        }
    }

    let order = OrderConfig { main, folders };
    *ORDER_STATE.lock().expect("ORDER_STATE mutex poisoned") = Some(order);
    Ok(())
}

/// Save in-memory order state to disk (called on window close)
fn save_order_to_disk() -> Result<(), String> {
    let _save_guard = SAVE_LOCK.lock().expect("SAVE_LOCK mutex poisoned");

    // Clone the order and release ORDER_STATE quickly to avoid blocking update_order
    let order = {
        let state = ORDER_STATE.lock().expect("ORDER_STATE mutex poisoned");
        match state.as_ref() {
            Some(order) => order.clone(),
            None => return Ok(()), // Nothing to save
        }
    };

    let config_dir = get_config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?;

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    let config = AppConfig {
        version: 1,
        order,
    };

    let config_path = get_config_path()
        .ok_or_else(|| "Could not determine config path".to_string())?;
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
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

/// Get all apps and folders - loads icons in parallel for speed
#[tauri::command]
async fn get_apps() -> Result<AppsResponse, String> {
    let (app_paths, folder_data) = discover_apps_and_folders();

    // Load app icons in parallel
    let mut apps: Vec<AppInfo> = app_paths
        .into_par_iter()
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

    // Load folder icons in parallel
    let folders: Vec<FolderInfo> = folder_data
        .into_par_iter()
        .filter_map(|(folder_path, sub_app_paths)| {
            let name = folder_path.file_name()?.to_string_lossy().to_string();
            let path_str = folder_path.to_string_lossy().to_string();

            let folder_apps: Vec<AppInfo> = sub_app_paths
                .into_par_iter()
                .filter_map(|app_path| {
                    let app_name = app_path.file_stem()?.to_string_lossy().to_string();
                    let app_path_str = app_path.to_string_lossy().to_string();
                    let icon = get_icon_if_cached(&app_path_str);

                    Some(AppInfo {
                        name: app_name,
                        path: app_path_str,
                        icon,
                    })
                })
                .collect();

            Some(FolderInfo {
                name,
                path: path_str,
                apps: folder_apps,
            })
        })
        .collect();

    Ok(AppsResponse { apps, folders })
}

#[tauri::command]
async fn launch_app(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    let canonical = path_buf
        .canonicalize()
        .map_err(|_| "Invalid app path".to_string())?;

    if !canonical.extension().map_or(false, |ext| ext == "app") {
        return Err("Invalid app path".to_string());
    }

    let allowed = get_applications_dirs();
    if !allowed.iter().any(|dir| canonical.starts_with(dir)) {
        return Err("App not in allowed directory".to_string());
    }

    Command::new("open")
        .arg(canonical)
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

/// Flag to prevent focus-loss close during app launch animation
static IS_LAUNCHING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Quit the app, saving order state first
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    if let Err(e) = save_order_to_disk() {
        eprintln!("Failed to save order on quit: {}", e);
    }
    app.exit(0);
}

/// Quit the app after a delay (used for launch animation)
/// During the delay, focus-loss closing is disabled
#[tauri::command]
fn quit_after_delay(app: tauri::AppHandle, delay_ms: u64) {
    IS_LAUNCHING.store(true, std::sync::atomic::Ordering::SeqCst);

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        if let Err(e) = save_order_to_disk() {
            eprintln!("Failed to save order on delayed quit: {}", e);
        }
        app.exit(0);
    });
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
            let window = app.get_webview_window("main")
                .expect("main webview window not found");

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

                                if !ns_window.is_null() {
                                    (*ns_window).setFrame_display(frame, true);
                                    (*ns_window).setLevel(19);
                                    (*ns_window).setHasShadow(false);
                                }
                            }
                        }
                    }
                }

                // Window starts hidden - frontend calls show_window after content is ready
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_apps, get_app_icon, launch_app, show_window, load_config, update_order, quit_app, quit_after_delay])
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                // Save order state before quitting
                if let Err(e) = save_order_to_disk() {
                    eprintln!("Failed to save order on quit: {}", e);
                }
                app.exit(0);
            }
        })
        .on_window_event(|window, event| {
            match event {
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
                        if let Err(e) = save_order_to_disk() {
                            eprintln!("Failed to save order on focus loss: {}", e);
                        }
                        app.exit(0);
                    });
                }
                WindowEvent::CloseRequested { .. } => {
                    // Save order state before window closes
                    if let Err(e) = save_order_to_disk() {
                        eprintln!("Failed to save order on close: {}", e);
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
