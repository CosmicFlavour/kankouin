ALTER TABLE tasks RENAME COLUMN under_review_since TO state_since;
UPDATE tasks SET state_since = created_at WHERE state_since IS NULL;
