-- The single task currently "in focus" (see commands::focus). Purely a
-- passive, self-directed reminder: it exists only so periodic notifications
-- can name the task the user said they'd be doing. It never restricts,
-- logs, or reacts to anything else done on the board.
--
-- Single-row table, same idiom as sync_meta (0001_init.sql): id is pinned
-- to 1 so there's at most one focus session, enforced by the schema itself
-- rather than app-layer bookkeeping.
CREATE TABLE focus_session (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL
);
