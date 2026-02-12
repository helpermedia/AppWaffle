---
name: commit
description: Commit with pre-checks. Runs lint and build checks before creating a conventional commit. Use when the user wants to commit changes.
user_invocable: true
---

# Commit with Pre-checks

## Steps

1. Run `bun lint` to check for ESLint issues
2. Run `bun run build` to verify TypeScript compiles and Vite builds
3. Run `bun tauri build` to verify the full Tauri app builds
4. If any check fails, stop and report the error
5. If all checks pass, show:
   - Files to commit with status and change summary
   - Proposed commit message following the format in CLAUDE.md
6. Wait for explicit user approval before committing

## Rules

- NEVER auto-commit or push without explicit approval
- NEVER push to remote unless explicitly asked

## Commit Message Format

```
type(scope): subject line (<72 chars)

Context paragraph explaining WHY this change is needed, what was broken,
or what motivated the change.

- Bullet points describing WHAT changed
- One bullet per logical change
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Scope is optional (e.g., `tauri`, `dnd`, `hooks`, `components`)
- Subject: lowercase, imperative mood, no period
- Body: blank line after subject, wrap at 72 chars
- Context paragraph explains the problem or motivation
- Bullet list covers the concrete changes
