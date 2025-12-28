# AppWaffle

Apple removed Launchpad in macOS 26 Tahoe. Time for a tastier way to launch your apps — served fresh in a crispy grid.

AppWaffle is a modern, customizable app launcher built with Tauri, React and TypeScript. It saves your layout and remembers your preferences.

## Features

- Full-screen app launcher with vibrancy blur effect
- Drag-and-drop reordering with macOS Launchpad-style behavior
- Folder support: drag apps together to create, drag out to remove
- Seamless drag handoff from folder modal to main grid
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

## License

MIT
