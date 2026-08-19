use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
    /// App Store category identifier (LSApplicationCategoryType), if declared
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FolderInfo {
    pub name: String,
    pub path: String,
    pub apps: Vec<AppInfo>,
}

#[derive(Debug, Clone, Serialize)]
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

/// How the main grid presents apps.
/// Deserializes leniently via From<String>: an unrecognized value (e.g.
/// written by a newer version) falls back to Scroll instead of failing
/// the whole config parse.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase", from = "String")]
pub enum LayoutMode {
    #[default]
    Scroll,
    Paged,
}

impl From<String> for LayoutMode {
    fn from(value: String) -> Self {
        match value.as_str() {
            "paged" => LayoutMode::Paged,
            _ => LayoutMode::Scroll,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub layout: LayoutMode,
    /// Settings this build doesn't model (e.g. from a newer version)
    /// round-trip untouched
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn default_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    pub order: OrderConfig,
    #[serde(default)]
    pub settings: AppSettings,
    /// Top-level keys this build doesn't model round-trip untouched
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            order: OrderConfig::default(),
            settings: AppSettings::default(),
            extra: serde_json::Map::new(),
        }
    }
}

/// In-memory config snapshot: seeded by load_config, mutated by
/// update_order/set_layout, written by save_config_to_disk. Holding the
/// whole parsed config (version and unknown keys included) means saves
/// never re-read the file and can't regress data this build doesn't model.
pub(crate) static CONFIG_STATE: Mutex<Option<AppConfig>> = Mutex::new(None);

/// Serializes disk writes so concurrent save_order_to_disk() calls don't interleave
pub(crate) static SAVE_LOCK: Mutex<()> = Mutex::new(());

/// Get config directory: ~/Library/Application Support/com.helpermedia.wafflepad/
pub(crate) fn get_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("com.helpermedia.wafflepad"))
}

/// Get config file path: ~/Library/Application Support/com.helpermedia.wafflepad/config.json
pub(crate) fn get_config_path() -> Option<PathBuf> {
    get_config_dir().map(|p| p.join("config.json"))
}

/// Save the in-memory config snapshot to disk (order changes ride the
/// exit-time call; settings changes save immediately). A no-op until
/// load_config has seeded the snapshot — a save can never invent a config
/// or clobber a file it hasn't read.
pub(crate) fn save_config_to_disk() -> Result<(), AppError> {
    let _save_guard = SAVE_LOCK.lock().unwrap_or_else(|p| p.into_inner());

    // Clone and release the state lock quickly to avoid blocking updates
    let Some(config) = CONFIG_STATE
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
    else {
        return Ok(()); // Nothing loaded, nothing to save
    };

    let config_dir = get_config_dir()
        .ok_or_else(|| AppError::Validation("Could not determine config directory".into()))?;

    fs::create_dir_all(&config_dir)?;

    let config_path = get_config_path()
        .ok_or_else(|| AppError::Validation("Could not determine config path".into()))?;
    let json = serde_json::to_string_pretty(&config)?;

    let tmp_path = config_path.with_extension("json.tmp");
    fs::write(&tmp_path, json)?;
    fs::rename(&tmp_path, &config_path)?;

    Ok(())
}
