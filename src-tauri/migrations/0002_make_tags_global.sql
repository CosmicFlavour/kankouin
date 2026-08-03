-- Tags become a single global namespace instead of per-workspace. Any
-- workspaces that independently created same-named tags must be merged:
-- one survivor row per distinct name, with every task_tags row remapped
-- to the survivor for its tag's name.
--
-- rusqlite_migration runs this whole file inside one already-open
-- transaction (tx.execute_batch), and foreign_keys is already ON before
-- migrations run and cannot be toggled mid-transaction. That rules out
-- the naive "DROP TABLE tags; ALTER TABLE tags_new RENAME TO tags"
-- approach: with FK enforcement on, DROP TABLE on a referenced parent
-- cascade-deletes every child row still pointing at *any* of its rows
-- (not just the ones literally being removed) — so it would wipe every
-- task_tags row, including ones already correctly repointed at a
-- survivor. task_tags has to be rebuilt alongside tags so nothing still
-- references the old `tags` table by the time it's dropped.

CREATE TABLE tags_new (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    color TEXT NOT NULL,
    UNIQUE(name)
);

-- One survivor per name: lowest rowid = first-created, deterministic.
INSERT INTO tags_new (id, name, color)
SELECT id, name, color FROM tags
WHERE rowid IN (SELECT MIN(rowid) FROM tags GROUP BY name);

-- References tags_new (not yet renamed to `tags`) so that dropping the
-- old `tags` table below has nothing left referencing it. SQLite rewrites
-- this FK's target automatically when tags_new is renamed to tags.
CREATE TABLE task_tags_new (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id  TEXT NOT NULL REFERENCES tags_new(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

INSERT INTO task_tags_new (task_id, tag_id)
SELECT tt.task_id, tn.id
FROM task_tags tt
JOIN tags t ON t.id = tt.tag_id
JOIN tags_new tn ON tn.name = t.name;

DROP TABLE task_tags;
DROP TABLE tags;
ALTER TABLE tags_new RENAME TO tags;
ALTER TABLE task_tags_new RENAME TO task_tags;
