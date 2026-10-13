-- Manual drag-and-drop ordering for tasks. A single float column shared by
-- every list view (Kanban columns, Today/This Week): dragging a task in one
-- view repositions it in all of them, since there's no view-specific
-- partition that makes sense for both a per-state board column and a
-- flat date-bucket list at once.
--
-- Fractional ranking (new value = midpoint of its neighbors) keeps a
-- reorder a single-row UPDATE instead of renumbering the whole list.
ALTER TABLE tasks ADD COLUMN order_index REAL NOT NULL DEFAULT 0;

-- Seed existing rows with their creation order so a first reorder has a
-- sane starting point instead of every task tying at 0.
UPDATE tasks
SET order_index = (
    SELECT COUNT(*) FROM tasks t2
    WHERE t2.created_at < tasks.created_at
       OR (t2.created_at = tasks.created_at AND t2.id < tasks.id)
);
