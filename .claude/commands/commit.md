# Commit with Pre-checks

Run all checks before committing:

1. Run `bun lint` to check for ESLint issues
2. Run `bun run build` to verify TypeScript compiles and Vite builds
3. Run `bun tauri build` to verify the full Tauri app builds
4. If all checks pass, show the git diff and create a commit with a conventional commit message (fix:, feat:, chore:, docs:, etc.)
5. If any check fails, stop and report the error

Do not push to remote unless explicitly asked.
