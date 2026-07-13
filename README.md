# Kankouin

A local-first desktop task manager for personal and professional projects. Built with
[Tauri](https://tauri.app) (Rust) and React — single-user, no backend server, your data
lives in a SQLite file on your machine.

## Features

- **Hierarchy**: Workspace → Project → (optional) Epic → (optional) User Story → Task.
  Small projects can skip straight to tasks; larger ones can use the full structure.
- **Kanban board**: four fixed states (`Todo → Doing → Under Review → Done`), drag-and-drop
  via `@dnd-kit`.
- **Deadlines**: an exact date, or a calendar-based fuzzy bucket (This Week / This Month /
  This Quarter / Someday) — never both.
- **Tags, priority, subtasks**: free-form colored tags per workspace, Low/Medium/High
  priority, and a simple subtask checklist per task.
- **Today view**: cross-project view of what's due, pulled across every workspace.
- **Daily Review**: a short, dismissible prompt for tasks that have sat in `Doing` or
  `Under Review` too long.
- **Encrypted cloud sync**: connect a Dropbox account, push/pull an AES-256-GCM
  encrypted copy of the local database. Passphrase-derived key (Argon2), never leaves
  Rust, never touches the webview.

## Tech stack

- **Shell**: Tauri v2 (Rust backend, native webview)
- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS, Radix UI primitives
- **Backend**: Rust, `rusqlite` (SQLite, WAL mode) with `rusqlite_migration`
- **Crypto**: AES-256-GCM + Argon2, Rust-only
- **Package manager**: pnpm (frontend), Cargo (backend)

## Getting started

### Prerequisites

- [pnpm](https://pnpm.io)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Tauri's platform dependencies for your OS — see the
  [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

### Install and run

```bash
pnpm install
pnpm tauri dev
```

This starts the Vite dev server and launches the Tauri desktop window with hot reload
on both the frontend and backend.

### Other commands

```bash
pnpm build              # type-check + build the frontend bundle
pnpm test                # run the frontend test suite (vitest) once
pnpm test:watch          # run the frontend test suite in watch mode
pnpm tauri build          # build a release desktop binary

cd src-tauri
cargo test                # run the Rust test suite
cargo build --tests       # compile check + warnings
cargo clippy --tests      # lint
```

## Project structure

```
src/                      React frontend
  components/               UI components (board, panels, dialogs)
  hooks/                    invoke() wrappers around Tauri commands
  lib/                      formatting/derivation helpers (no business logic)

src-tauri/                Rust backend
  src/
    commands/               #[tauri::command] entry points, one file per domain
    cloud/                   cloud provider trait + Dropbox implementation, OAuth
    db/                      connection setup, migrations runner
    models/                  shared structs (Task, Project, Workspace, ...)
  migrations/                SQLite schema migrations
  tests/                     Rust integration tests
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
