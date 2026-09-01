-- Audit trail for mutating AI tool calls. Persisted (unlike the in-memory
-- chat conversation, which resets on "New conversation" or an app
-- restart) so a revertible action stays revertible even after either.
CREATE TABLE ai_action_log (
    id           TEXT PRIMARY KEY,
    tool_name    TEXT NOT NULL,
    arguments    TEXT NOT NULL,
    summary      TEXT NOT NULL,
    task_id      TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    before_state TEXT,
    reverted_at  TEXT,
    created_at   TEXT NOT NULL
);
