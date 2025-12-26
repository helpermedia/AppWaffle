# AppWaffle

A macOS Launchpad alternative built with Tauri, React and TypeScript.

## Features

- Full-screen app launcher with vibrancy blur effect
- Drag-and-drop reordering of apps and folders
- Folder support with expandable nested app organization
- Progressive icon loading with disk caching
- Keyboard navigation (Arrow keys, Enter to launch, Escape to close)
- Click outside to dismiss

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
- **Drag & Drop**: @dnd-kit
- **Backend**: Rust, Tauri
- **Icons**: NSWorkspace API

## License

MIT
