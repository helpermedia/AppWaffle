# Wafflepad

Apple removed Launchpad in macOS 26 Tahoe. Time for a tastier way to launch your apps, served fresh in a crispy grid.

Wafflepad is a modern, customizable app launcher built with Tauri, React and TypeScript. It saves your layout and remembers your preferences.

## Features

- Full-screen app launcher with vibrancy blur effect
- Type-to-search with ranked matches, including apps inside folders
- Native right-click menu on apps: Open, Show in Finder, Get Info and Quick Look
- Drag-and-drop reordering with macOS Launchpad-style behavior
- Edge auto-scroll while dragging near the top or bottom of the grid
- Folder support: drag apps together to create, drag out to remove
- Seamless drag handoff from folder modal to main grid
- Drag an app onto the Dock to pin it, like the original Launchpad
- Progressive icon loading with disk caching
- Keyboard navigation: Arrow keys move the selection, Enter launches, Escape peels back search, drags and folders before closing
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

Wafflepad stores its data in standard macOS directories:

- **Config**: `~/Library/Application Support/com.helpermedia.wafflepad/config.json`
- **Icon cache**: `~/Library/Caches/com.helpermedia.wafflepad/icons/`

## Known behavior

When you drag an app onto the Dock, macOS may show a notification: *"Wafflepad was prevented from modifying apps on your Mac."*

This is harmless and the app still gets pinned. Wafflepad only hands the drag over to macOS. The system's own drag-and-drop machinery then tries to stamp tracking metadata (an extended attribute) on the dragged app bundle. Writing inside another app's bundle requires the App Management permission, so macOS blocks that bookkeeping write and shows the notification. Pinning is unaffected because the Dock only updates its own settings.

Wafflepad never modifies other apps and does not need the permission. If the notification bothers you, you can enable Wafflepad under **System Settings, Privacy & Security, App Management**, but be aware that this grants it the right to update or delete other applications, which it does not need.

A Dock drag is also one-way: after a short dwell over the Dock, the gesture is handed to macOS, and Wafflepad cannot take it back mid-drag. If you change your mind, release anywhere (or press Escape) and the drag image dissolves, leaving the app in the grid exactly where it was. Grazing the Dock briefly while dragging near the bottom edge does not hand off.

The first time you pick **Get Info** from an app's right-click menu, macOS asks: *"Wafflepad" wants access to control "Finder".*

Finder's Get Info panel has no public API. The only way to open it is to ask Finder itself, and macOS treats that as one app controlling another, so it sits behind this one-time Automation consent. Wafflepad sends Finder a single instruction (open the info window for the chosen app) and nothing else. The other menu items (Open, Show in Finder and Quick Look) do not use this permission at all.

Click **Allow** and macOS remembers the choice. **Don't Allow** is remembered too: Get Info will then silently do nothing until you re-enable it under **System Settings, Privacy & Security, Automation, Wafflepad, Finder**. Unsigned development builds may ask again after a rebuild; a signed build asks once.

## License

MIT
