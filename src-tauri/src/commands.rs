use rayon::prelude::*;
use std::path::PathBuf;
use std::process::Command;

use crate::app_discovery::{discover_apps_and_folders, get_applications_dirs};
use crate::config::{
    get_config_path, AppConfig, AppInfo, AppsResponse, FolderInfo, FolderMetadata, OrderConfig,
    ORDER_STATE,
};
use crate::icon_cache::{cleanup_orphaned_icons, get_icon_if_cached};
use crate::AppError;

/// Load app config from disk
#[tauri::command]
pub(crate) async fn load_config() -> Result<AppConfig, AppError> {
    let config_path = get_config_path()
        .ok_or_else(|| AppError::Validation("Could not determine config directory".into()))?;

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let contents = std::fs::read_to_string(&config_path)?;
    Ok(serde_json::from_str(&contents)?)
}

/// Update order in memory (called on every change from frontend)
/// Disk write happens only on window close for safety
#[tauri::command]
pub(crate) fn update_order(
    main: Vec<String>,
    folders: Vec<FolderMetadata>,
) -> Result<(), AppError> {
    const MAX_MAIN_ENTRIES: usize = 1000;
    const MAX_FOLDERS: usize = 200;
    const MAX_FOLDER_APPS: usize = 500;
    const MAX_STRING_LEN: usize = 1024;

    if main.len() > MAX_MAIN_ENTRIES {
        return Err(AppError::Validation("Too many main entries".into()));
    }
    if folders.len() > MAX_FOLDERS {
        return Err(AppError::Validation("Too many folders".into()));
    }
    if main.iter().any(|s| s.len() > MAX_STRING_LEN) {
        return Err(AppError::Validation("Main entry too long".into()));
    }
    for folder in &folders {
        if folder.id.len() > MAX_STRING_LEN || folder.name.len() > MAX_STRING_LEN {
            return Err(AppError::Validation("Folder field too long".into()));
        }
        if folder.app_paths.len() > MAX_FOLDER_APPS {
            return Err(AppError::Validation("Too many apps in folder".into()));
        }
        if folder.app_paths.iter().any(|s| s.len() > MAX_STRING_LEN) {
            return Err(AppError::Validation("Folder app path too long".into()));
        }
    }

    let order = OrderConfig { main, folders };
    *ORDER_STATE.lock().unwrap_or_else(|p| p.into_inner()) = Some(order);
    Ok(())
}

/// Generate icon for a single app (called from frontend for progressive loading)
#[tauri::command]
pub(crate) async fn get_app_icon(path: String) -> Option<String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.is_absolute() || !path_buf.extension().map_or(false, |ext| ext == "app") {
        return None;
    }

    // Check cache first
    if let Some(cached) = get_icon_if_cached(&path) {
        return Some(cached);
    }
    // Generate if not cached
    #[cfg(target_os = "macos")]
    return crate::icon_cache::generate_and_cache_icon(&path);
    #[cfg(not(target_os = "macos"))]
    None
}

/// Get all apps and folders - loads icons in parallel for speed
#[tauri::command]
pub(crate) async fn get_apps() -> Result<AppsResponse, AppError> {
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
            let raw_name = folder_path.file_name()?.to_string_lossy().to_string();
            let name = raw_name
                .strip_suffix(".localized")
                .unwrap_or(&raw_name)
                .to_string();
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

    // Clean up orphaned icon cache entries in the background
    let all_app_paths: Vec<String> = apps
        .iter()
        .map(|a| a.path.clone())
        .chain(
            folders
                .iter()
                .flat_map(|f| f.apps.iter().map(|a| a.path.clone())),
        )
        .collect();
    std::thread::spawn(move || cleanup_orphaned_icons(&all_app_paths));

    Ok(AppsResponse { apps, folders })
}

#[tauri::command]
pub(crate) async fn launch_app(path: String) -> Result<(), AppError> {
    let path_buf = PathBuf::from(&path);

    let canonical = path_buf.canonicalize()?;

    if !canonical.extension().map_or(false, |ext| ext == "app") {
        return Err(AppError::Validation("Invalid app path".into()));
    }

    let allowed = get_applications_dirs();
    if !allowed.iter().any(|dir| canonical.starts_with(dir)) {
        return Err(AppError::Validation("App not in allowed directory".into()));
    }

    Command::new("open").arg(canonical).spawn()?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn show_window(window: tauri::WebviewWindow) -> Result<(), AppError> {
    window.show()?;
    window.set_focus()?;
    Ok(())
}

/// Quit the app, saving order state first
#[tauri::command]
pub(crate) fn quit_app(app: tauri::AppHandle) {
    crate::graceful_exit(&app);
}

/// Quit the app after a delay (used for launch animation)
/// During the delay, focus-loss closing is disabled
#[tauri::command]
pub(crate) fn quit_after_delay(app: tauri::AppHandle, delay_ms: u64) {
    crate::IS_LAUNCHING.store(true, std::sync::atomic::Ordering::SeqCst);

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        crate::graceful_exit(&app);
    });
}
