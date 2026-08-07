# AppWaffle

Apple removed Launchpad in macOS 26 Tahoe. Time for a tastier way to launch your apps — served fresh in a crispy grid.

AppWaffle is a modern, customizable app launcher built with Tauri, React and TypeScript. It saves your layout and remembers your preferences.

## Features

- Full-screen app launcher with vibrancy blur effect
- Drag-and-drop reordering with macOS Launchpad-style behavior
- Folder support: drag apps together to create, drag out to remove
- Seamless drag handoff from folder modal to main grid
- Drag an app onto the Dock to pin it, like the original Launchpad
- Progressive icon loading with disk caching
- Keyboard navigation (Arrow keys, Enter to launch, Escape to close)
- Click outside or press Escape to dismiss

## Requirements

- macOS
- [Bun](https://bun.sh)
- [Rust](https://rustup.rs)

## Development

```bash
bun install
bun tauri dev
```

## Build

```bash
bun tauri build
```

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Drag & Drop**: Custom implementation with center-crossing detection
- **Backend**: Rust, Tauri
- **Icons**: NSWorkspace API

## Data

AppWaffle stores its data in standard macOS directories:

- **Config**: `~/Library/Application Support/com.helpermedia.appwaffle/config.json`
- **Icon cache**: `~/Library/Caches/com.helpermedia.appwaffle/icons/`

## Known behavior

When you drag an app onto the Dock, macOS may show a notification: *"AppWaffle was prevented from modifying apps on your Mac."*

This is harmless and the app still gets pinned. AppWaffle only hands the drag over to macOS — the system's own drag-and-drop machinery then tries to stamp tracking metadata (an extended attribute) on the dragged app bundle. Writing inside another app's bundle requires the App Management permission, so macOS blocks that bookkeeping write and shows the notification. Pinning is unaffected because the Dock only updates its own settings.

AppWaffle never modifies other apps and does not need the permission. If the notification bothers you, you can enable AppWaffle under **System Settings → Privacy & Security → App Management** — but be aware that this grants it the right to update or delete other applications, which it does not need.

## License

MIT
