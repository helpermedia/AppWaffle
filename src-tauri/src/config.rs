use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::AppError;

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

/// In-memory order state - updated on every change, saved to disk only on exit
pub(crate) static ORDER_STATE: Mutex<Option<OrderConfig>> = Mutex::new(None);

/// Serializes disk writes so concurrent save_order_to_disk() calls don't interleave
pub(crate) static SAVE_LOCK: Mutex<()> = Mutex::new(());

/// Get config directory: ~/Library/Application Support/com.helpermedia.appwaffle/
pub(crate) fn get_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("com.helpermedia.appwaffle"))
}

/// Get config file path: ~/Library/Application Support/com.helpermedia.appwaffle/config.json
pub(crate) fn get_config_path() -> Option<PathBuf> {
    get_config_dir().map(|p| p.join("config.json"))
}

/// Save in-memory order state to disk (called on window close)
pub(crate) fn save_order_to_disk() -> Result<(), AppError> {
    let _save_guard = SAVE_LOCK.lock().unwrap_or_else(|p| p.into_inner());

    // Clone the order and release ORDER_STATE quickly to avoid blocking update_order
    let order = {
        let state = ORDER_STATE.lock().unwrap_or_else(|p| p.into_inner());
        match state.as_ref() {
            Some(order) => order.clone(),
            None => return Ok(()), // Nothing to save
        }
    };

    let config_dir = get_config_dir()
        .ok_or_else(|| AppError::Validation("Could not determine config directory".into()))?;

    fs::create_dir_all(&config_dir)?;

    let config = AppConfig {
        version: 1,
        order,
    };

    let config_path = get_config_path()
        .ok_or_else(|| AppError::Validation("Could not determine config path".into()))?;
    let json = serde_json::to_string_pretty(&config)?;

    let tmp_path = config_path.with_extension("json.tmp");
    fs::write(&tmp_path, json)?;
    fs::rename(&tmp_path, &config_path)?;

    Ok(())
}
