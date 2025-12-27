---
name: rust
description: Tauri v2 and Rust backend best practices, commands, state management, IPC and security patterns. Use when writing Rust backend code, creating commands or integrating with the frontend.
---

# Tauri v2 Best Practices

## When to Apply

Use this skill when:
- Writing or refactoring Rust backend commands
- Managing application state
- Handling IPC between frontend and backend
- Working with platform-specific code (macOS, Windows, Linux)
- Configuring plugins or security capabilities

---

## Core Principles

### 1. Commands Are the Primary IPC

Commands are Rust functions exposed to the frontend via `#[tauri::command]`.

**Do:**
- Use async commands for I/O operations to prevent UI freezes
- Return `Result<T, String>` for fallible operations
- Keep commands focused — one responsibility each

**Don't:**
- Block the main thread with heavy computation
- Return raw errors (convert to `String` or custom serializable type)
- Forget to register commands in `generate_handler!`

```rust
// ✅ Good: Async command with error handling
#[tauri::command]
async fn load_data(path: String) -> Result<Data, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read: {}", e))
        .and_then(|s| serde_json::from_str(&s)
            .map_err(|e| format!("Failed to parse: {}", e)))
}

// ❌ Bad: Blocking, no error handling
#[tauri::command]
fn load_data(path: String) -> Data {
    let contents = fs::read_to_string(&path).unwrap(); // panics!
    serde_json::from_str(&contents).unwrap()
}
```

### 2. Prefer Plugins Over Custom Code

Tauri v2 moved many APIs to plugins. Use official plugins when available.

```rust
// Add to Cargo.toml
tauri-plugin-opener = "2"
tauri-plugin-process = "2"
tauri-plugin-fs = "2"

// Register in setup
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
```

**Common plugins:**
- `tauri-plugin-fs` — File system access
- `tauri-plugin-shell` — Run shell commands
- `tauri-plugin-opener` — Open URLs/files with default app
- `tauri-plugin-process` — Process management (exit, restart)
- `tauri-plugin-dialog` — Native dialogs
- `tauri-plugin-clipboard-manager` — Clipboard access

---

## Commands

### Basic Command Definition

```rust
use tauri::command;

#[tauri::command]
async fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

// Register in lib.rs
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Frontend Invocation

```typescript
import { invoke } from '@tauri-apps/api/core';

// Arguments are camelCase by default
const result = await invoke<string>('greet', { name: 'World' });
```

### Argument Naming

Frontend sends camelCase, Rust receives snake_case (auto-converted):

```rust
#[tauri::command]
async fn create_item(item_name: String, is_active: bool) -> Result<(), String> {
    // ...
}
```

```typescript
// Frontend: camelCase
await invoke('create_item', { itemName: 'Test', isActive: true });
```

To use snake_case on frontend, add the attribute:

```rust
#[tauri::command(rename_all = "snake_case")]
async fn create_item(item_name: String) -> Result<(), String> {
    // ...
}
```

### Accessing Window and AppHandle

Commands can receive special injected parameters:

```rust
use tauri::{AppHandle, WebviewWindow};

#[tauri::command]
async fn show_window(window: WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_app_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
```

---

## Error Handling

### Simple: Convert to String

For straightforward cases, convert errors to `String`:

```rust
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}
```

### Better: Custom Error Type with `thiserror`

For richer error handling, create a serializable error type:

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

// Convert std errors to AppError
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

#[tauri::command]
async fn load_config() -> Result<Config, AppError> {
    let path = get_config_path().ok_or(AppError::NotFound("config dir".into()))?;
    let contents = fs::read_to_string(&path)?;
    serde_json::from_str(&contents)
        .map_err(|e| AppError::Parse(e.to_string()))
}
```

Frontend receives structured error:

```typescript
try {
  await invoke('load_config');
} catch (error) {
  // error is { Io: "..." } or { Parse: "..." } or { NotFound: "..." }
}
```

---

## State Management

### Basic State with Mutex

Use `Mutex` for mutable shared state. Tauri wraps it in `Arc` automatically.

```rust
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
struct AppState {
    counter: u32,
    items: Vec<String>,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Mutex::new(AppState::default()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![increment, get_count])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn increment(state: tauri::State<'_, Mutex<AppState>>) -> u32 {
    let mut state = state.lock().unwrap();
    state.counter += 1;
    state.counter
}

#[tauri::command]
fn get_count(state: tauri::State<'_, Mutex<AppState>>) -> u32 {
    state.lock().unwrap().counter
}
```

### Async Commands with Tokio Mutex

For async commands that hold locks across `.await` points:

```rust
use tokio::sync::Mutex;

#[tauri::command]
async fn async_increment(state: tauri::State<'_, Mutex<AppState>>) -> Result<u32, ()> {
    let mut state = state.lock().await;
    state.counter += 1;
    Ok(state.counter)
}
```

> **Note:** Async commands with borrowed state (`State<'_, T>`) must return `Result`.

### Static Mutex (Alternative Pattern)

For simpler cases, use a static Mutex (as in this project):

```rust
use std::sync::Mutex;

static ORDER_STATE: Mutex<Option<OrderConfig>> = Mutex::new(None);

#[tauri::command]
fn update_order(main: Vec<String>) {
    *ORDER_STATE.lock().unwrap() = Some(OrderConfig { main });
}

fn save_on_exit() {
    let state = ORDER_STATE.lock().unwrap();
    if let Some(order) = state.as_ref() {
        // Save to disk
    }
}
```

### Accessing State Outside Commands

Use `AppHandle` to access state from event handlers:

```rust
.on_window_event(|window, event| {
    if let WindowEvent::CloseRequested { .. } = event {
        let app = window.app_handle();
        let state = app.state::<Mutex<AppState>>();
        let data = state.lock().unwrap();
        // Save data before close
    }
})
```

---

## Events

### Emit from Rust to Frontend

```rust
use tauri::Emitter;

#[tauri::command]
async fn start_process(app: AppHandle) -> Result<(), String> {
    // Emit progress updates
    app.emit("progress", 50).map_err(|e| e.to_string())?;

    // Emit to specific window
    if let Some(window) = app.get_webview_window("main") {
        window.emit("done", ()).ok();
    }

    Ok(())
}
```

### Listen in Frontend

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<number>('progress', (event) => {
  console.log('Progress:', event.payload);
});

// Cleanup when done
unlisten();
```

---

## Platform-Specific Code

### Conditional Compilation

```rust
#[cfg(target_os = "macos")]
fn macos_only_function() {
    // macOS-specific code
}

#[cfg(target_os = "windows")]
fn windows_only_function() {
    // Windows-specific code
}

#[cfg(not(target_os = "macos"))]
fn non_macos_fallback() {
    // Fallback for other platforms
}
```

### In Commands

```rust
#[tauri::command]
async fn get_icon(path: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        return get_macos_icon(&path);
    }

    #[cfg(not(target_os = "macos"))]
    None
}
```

### macOS-Specific APIs

```rust
#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplication, NSWindow};

#[cfg(target_os = "macos")]
fn setup_macos_window(window: &tauri::WebviewWindow) {
    let mtm = MainThreadMarker::new().expect("Must be on main thread");
    let app = NSApplication::sharedApplication(mtm);
    // Configure macOS-specific settings
}
```

---

## Window Management

### Setup Hook

```rust
.setup(|app| {
    let window = app.get_webview_window("main").unwrap();

    // Show and focus
    window.show()?;
    window.set_focus()?;

    // Platform-specific setup
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)?;
    }

    Ok(())
})
```

### Window Events

```rust
.on_window_event(|window, event| {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            // Prevent close and hide instead
            api.prevent_close();
            window.hide().ok();
        }
        WindowEvent::Focused(focused) => {
            if !focused {
                // Window lost focus
            }
        }
        _ => {}
    }
})
```

### Menu Events

```rust
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

.setup(|app| {
    let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(app, &[
        &Submenu::with_items(app, "App", true, &[&quit])?
    ])?;
    app.set_menu(menu)?;
    Ok(())
})
.on_menu_event(|app, event| {
    if event.id() == "quit" {
        app.exit(0);
    }
})
```

---

## Security

### Principle of Least Privilege

Only expose what the frontend needs:

```rust
// ✅ Specific command for specific action
#[tauri::command]
async fn launch_app(path: String) -> Result<(), String> {
    // Validate path is an .app bundle
    if !path.ends_with(".app") {
        return Err("Invalid app path".into());
    }
    Command::new("open").arg(&path).spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ❌ Too permissive - allows arbitrary command execution
#[tauri::command]
async fn run_command(cmd: String, args: Vec<String>) -> Result<String, String> {
    // DON'T DO THIS
}
```

### Capabilities (tauri.conf.json)

Configure what plugins and APIs are allowed:

```json
{
  "app": {
    "security": {
      "capabilities": ["main-capability"]
    }
  }
}
```

### Input Validation

Always validate input from the frontend:

```rust
#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    // Validate path is within allowed directory
    let allowed_dir = dirs::config_dir()
        .ok_or("No config dir")?
        .join("com.myapp");

    let canonical = PathBuf::from(&path)
        .canonicalize()
        .map_err(|_| "Invalid path")?;

    if !canonical.starts_with(&allowed_dir) {
        return Err("Path outside allowed directory".into());
    }

    fs::write(&path, content).map_err(|e| e.to_string())
}
```

---

## Async Patterns

### Spawn Background Tasks

```rust
use tauri::async_runtime;

#[tauri::command]
async fn start_background_task(app: AppHandle) {
    async_runtime::spawn(async move {
        loop {
            // Background work
            tokio::time::sleep(Duration::from_secs(60)).await;
            app.emit("tick", ()).ok();
        }
    });
}
```

### Channels for Streaming

For streaming data (e.g., download progress):

```rust
use tauri::ipc::Channel;

#[tauri::command]
async fn download(url: String, channel: Channel<u32>) -> Result<(), String> {
    for progress in 0..=100 {
        channel.send(progress).map_err(|e| e.to_string())?;
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Ok(())
}
```

```typescript
await invoke('download', {
  url: 'https://example.com/file',
  channel: new Channel<number>((progress) => {
    console.log(`Progress: ${progress}%`);
  }),
});
```

---

## Serde Tips

### Rename Fields for Frontend

```rust
#[derive(Serialize, Deserialize)]
pub struct Item {
    #[serde(rename = "itemId")]
    pub item_id: String,

    #[serde(rename = "createdAt")]
    pub created_at: u64,

    #[serde(default)]
    pub optional_field: Option<String>,
}
```

### Skip Serializing None

```rust
#[derive(Serialize)]
pub struct Response {
    pub data: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
```

---

## Code Review Checklist

When reviewing Tauri/Rust code:

- [ ] Commands are async for I/O operations
- [ ] All commands return `Result` for fallible operations
- [ ] Errors are properly converted (no `.unwrap()` on user input)
- [ ] Commands registered in `generate_handler!`
- [ ] State wrapped in `Mutex` (or `tokio::Mutex` for async)
- [ ] Platform-specific code uses `#[cfg(target_os = "...")]`
- [ ] Input from frontend is validated
- [ ] No arbitrary command/file execution
- [ ] Plugins used instead of custom implementations where available
- [ ] Cleanup on window close / app exit
