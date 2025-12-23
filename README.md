# AppWaffle

A fast, native macOS Launchpad alternative built with Tauri, React, and TypeScript.

## Features

- Full-screen app launcher with vibrancy blur effect
- Progressive icon loading with disk caching
- Native macOS integration (dock visible, menu bar auto-hides)
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
- **Backend**: Rust, Tauri
- **Icons**: NSWorkspace API

## Project Structure

```
appwaffle/
├── src/                    # Frontend source
│   ├── components/         # React components
│   │   ├── AppWaffle.tsx   # Main app container
│   │   ├── AppGrid.tsx     # Grid layout for apps
│   │   └── AppIcon.tsx     # Individual app icon
│   ├── hooks/              # Custom React hooks
│   │   └── useApps.ts      # App loading and management
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Rust backend
│   └── src/
│       ├── lib.rs          # Core Tauri commands
│       └── main.rs         # Application entry point
└── package.json
```

## License

MIT
