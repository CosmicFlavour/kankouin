CREATE TABLE workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT,
    icon        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE projects (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    archived     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE epics (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE user_stories (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    epic_id    TEXT REFERENCES epics(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    epic_id        TEXT REFERENCES epics(id) ON DELETE SET NULL,
    user_story_id  TEXT REFERENCES user_stories(id) ON DELETE SET NULL,

    title          TEXT NOT NULL,
    description    TEXT,
    state          TEXT NOT NULL CHECK (state IN ('todo','doing','under_review','done')),
    priority       TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),

    deadline_type  TEXT CHECK (deadline_type IN ('exact','fuzzy')),
    exact_date     TEXT,
    fuzzy_bucket   TEXT CHECK (fuzzy_bucket IN ('this_week','this_month','this_quarter','someday')),
    bucket_period  TEXT,

    under_review_since TEXT,

    archived       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE subtasks (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE task_logs (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL DEFAULT 'note' CHECK (entry_type IN ('note','state_change','rollover','conflict_resolution')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE tags (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL,
    UNIQUE(workspace_id, name)
);

CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE task_dependencies (
    task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_id),
    CHECK (task_id != depends_on_id)
);

CREATE TABLE sync_meta (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    device_id      TEXT NOT NULL,
    last_synced_at TEXT
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_exact_date ON tasks(exact_date);
CREATE INDEX idx_tasks_fuzzy_bucket ON tasks(fuzzy_bucket, bucket_period);
CREATE INDEX idx_task_logs_task ON task_logs(task_id);
