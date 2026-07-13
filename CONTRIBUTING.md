# Contributing to Kankouin

## Setup

```bash
pnpm install
pre-commit install   # runs cargo fmt + cargo clippy on commit, see .pre-commit-config.yaml
pnpm tauri dev
```

See [README.md](README.md) for prerequisites and the full command list.

## Architecture: the Rust/React split

This is the one rule that matters most in this codebase, so keep it in mind for every
change:

- **Rust (`src-tauri/`) owns all business logic and data access.** SQLite queries, stale
  task detection, deadline/rollover math, dependency checks, crypto, file system access —
  all of it lives in Rust and is exposed via `#[tauri::command]` functions.
- **React (`src/`) owns rendering only.** UI state (open panels, drag visuals, active
  workspace selection), calling `invoke()`, and display formatting. Client-side validation
  is fine for instant feedback, but Rust re-validates regardless.

If you find yourself computing something from raw task/date data in a hook or component
instead of getting it back from a command, that logic probably belongs in Rust instead.

Avoid N+1 IPC calls — batch data into single command responses (`get_task` returns
subtasks + tags + logs in one call, `list_tasks` returns joined tags/blocked flags) rather
than looping `invoke()` per row.

## Adding or changing a Tauri command

A command isn't "live" just because the Rust function compiles. Two more steps are
required, and it's easy to skip them:

1. Register it in the `generate_handler!` macro in [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs).
2. Wire an actual `invoke("command_name", ...)` call into a frontend hook
   (`src/hooks/*.ts`) that a rendered component calls.

A command registered but never invoked from the frontend is dead code. If
you're intentionally building backend support ahead of the UI, say so in the PR/commit
description so it isn't mistaken for cruft later.

## Database migrations

- Schema lives in [`src-tauri/migrations/`](src-tauri/migrations). Never edit an existing
  migration file once it's merged — add a new one.
- Every table needs `created_at`/`updated_at` (or the append-only equivalent)
- Run `cargo test` after any schema change; several tests exercise real migrations against
  a temp SQLite file.

## Testing

- **Rust**: unit tests live in a `#[cfg(test)] mod tests` block at the bottom of the file
  they test, using `crate::db::test_connection()` for an in-memory DB. Integration tests
  that need real on-disk files or cross real Tauri command boundaries go in
  `src-tauri/tests/`.
  ```bash
  cd src-tauri && cargo test
  ```
- **Frontend**: colocated `*.test.ts` / `*.test.tsx` files next to the code they cover,
  using Vitest + Testing Library. Hooks are tested against a faked `invoke()`.
  ```bash
  pnpm test
  ```
- Before opening a PR, also run:
  ```bash
  cd src-tauri && cargo build --tests && cargo clippy --tests -- -D warnings
  ```
  A clean `cargo build --tests` with zero warnings is the fastest way to catch orphaned
  functions after a refactor — rustc's dead-code lint flags anything with no remaining
  caller.

## Commit messages

This repo uses Conventional Commits with a scope of `frontend` or `backend` (or both, if
truly a cross-cutting change):

```
feat(frontend): add tag filter
fix(backend): dropdown colors for epic/userstories filters
refactor(backend): remove unused commands
test(frontend): sync component
```
