use std::fs;
use std::path::PathBuf;

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

/// Get cached icon path if it exists and is still fresh
fn get_cached_icon_path(app_path: &str) -> Option<PathBuf> {
    let icons_dir = get_icons_cache_dir()?;
    let icon_file = icons_dir.join(get_icon_filename(app_path));
    if !icon_file.exists() {
        return None;
    }

    // Invalidate cache if the .app bundle was modified after the icon was cached
    let app_modified = fs::metadata(app_path).ok()?.modified().ok()?;
    let icon_modified = fs::metadata(&icon_file).ok()?.modified().ok()?;
    if app_modified > icon_modified {
        return None;
    }

    Some(icon_file)
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
    use base64::Engine;
    use std::process::Command;

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
pub(crate) fn get_icon_if_cached(app_path: &str) -> Option<String> {
    get_cached_icon_path(app_path).map(|p| format!("file://{}", p.display()))
}

/// Remove cached icons for apps that no longer exist on disk
pub(crate) fn cleanup_orphaned_icons(valid_app_paths: &[String]) {
    let Some(icons_dir) = get_icons_cache_dir() else {
        return;
    };
    let Ok(entries) = fs::read_dir(&icons_dir) else {
        return;
    };

    let valid_filenames: std::collections::HashSet<String> = valid_app_paths
        .iter()
        .map(|p| get_icon_filename(p))
        .collect();

    for entry in entries.flatten() {
        let filename = entry.file_name().to_string_lossy().to_string();
        if filename.ends_with(".png") && !valid_filenames.contains(&filename) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Generate icon and save to cache, returns file:// URL
#[cfg(target_os = "macos")]
pub(crate) fn generate_and_cache_icon(app_path: &str) -> Option<String> {
    let png_bytes = get_icon_nsworkspace_bytes(app_path)?;
    let saved_path = save_icon_to_cache(app_path, &png_bytes)?;
    Some(format!("file://{}", saved_path.display()))
}
