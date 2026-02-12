use std::fs;
use std::path::PathBuf;

pub(crate) fn get_applications_dirs() -> Vec<PathBuf> {
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

pub(crate) fn discover_apps_and_folders() -> (Vec<PathBuf>, Vec<(PathBuf, Vec<PathBuf>)>) {
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
