---
name: diff
description: Review uncommitted git changes for issues. Checks correctness, Wafflepad-specific hazards (grid math, drag-and-drop, Tauri IPC) and project conventions. Use when the user wants the current changes reviewed.
user_invocable: true
---

# Review Current Changes

Perform a code review of uncommitted changes. Report findings only, never apply fixes unless explicitly asked.

## Prerequisites

Load the pattern skill(s) matching the changed file types. Each ends with a Code Review Checklist to apply:

- `.ts`/`.tsx` in `src/` changed: read `.claude/skills/react/SKILL.md`
- Styling (className) changed: read `.claude/skills/tailwind/SKILL.md`
- `.rs` in `src-tauri/` changed: read `.claude/skills/rust/skill.md`

## Steps

1. **Collect changes**: run `git status --short`, `git diff` and `git diff --staged`. Read untracked files in full. If nothing changed, inform the user and stop.
2. **Read context**: for each changed file, read the full file (not just the diff) plus the direct callers or consumers of the changed code.
3. **Analyze** using the checks below.
4. **Report** using the output format, ordered Critical, Warning, Suggestion.

## Review Checks

### Correctness

- Index math: row/col/slot/page conversions and flat-order windowing are the highest-risk code in this project. Verify boundaries (last slot of a page, partial last page, page count changes after folder creation)
- Stale closures: handlers registered once but reading changing state (the `useLatestRef` hook exists for this)
- Async results applied after unmount or after a newer request superseded them
- Edge cases: empty grid, single page, folder with one item, search with no matches

### Drag & Drop

The DnD engine (`src/lib/helper-dnd/`) and its hooks (`useDragGrid`, `useDragHandoff`, `useDockDrag`) intentionally use direct DOM manipulation for performance. Do NOT flag imperative DOM code there as a React anti-pattern.

Do check:

- Every DOM mutation during a drag is reverted or reconciled with React state on drag end AND on cancel (Escape, window blur)
- No React state updates in the pointermove path (would re-render per move event)
- Pointer and window listeners cleaned up on unmount and on drag end
- `src/lib/helper-dnd/` stays framework-agnostic: no React imports inside it

### Tauri IPC Boundary

- Commands return `Result<T, AppError>` and never panic on frontend input (no `.unwrap()`/`.expect()` on it)
- New commands are registered in `generate_handler!` in `src-tauri/src/lib.rs` (forgetting this fails silently at runtime)
- Paths from the frontend are validated (`validated_app_path`), no arbitrary path or shell execution
- TS types in `src/types/app.ts` match the Rust serde structs, including camelCase renames
- `invoke` args are camelCase on the TS side for snake_case Rust params
- Every `invoke` rejection is handled on the frontend

### React & Tailwind

Apply the checklists from the loaded skills. Highest-value checks:

- No premature `React.memo`/`useMemo`/`useCallback`, no `eslint-disable` comments
- Every new `useEffect` is justified (external systems only): derived values belong in render, state resets use `key`
- Conditional classes go through `cn()`, design tokens live in `@theme` in `index.css`

### Conventions

- Named exports and `function` declarations for components
- Hooks in `src/hooks/` with `use` prefix, types in `src/types/`, utilities in `src/utils/`
- Imports use the `@/` alias
- Tailwind only, no CSS modules; inline styles only for dynamic values (transforms, computed positions)

### Performance

The grid renders hundreds of tiles, so per-tile cost multiplies:

- No O(n²) work in render paths (per-tile scans over the full app list)
- No state that updates on every pointermove or scroll
- Icon loading stays lazy and cached (base64 icon payloads are large)

## Output Format

```
## Overview
One or two sentences on what the changes do.

## Critical Issues
- **[file:line]** What is wrong and how it fails
  Fix: suggested change

## Warnings
- **[file:line]** Description and reasoning
  Fix: suggested change

## Suggestions
- **[file:line]** Description
  Fix: suggested approach
```

If no issues are found, say so briefly and approve the changes.

## Guidelines

- Quote the problematic code and reference the exact file and line
- Explain why something is wrong, not just what
- Run `bun lint` instead of eyeballing style; do not repeat what it already enforces
- Skip a finding when the fix would add more complexity than it removes
