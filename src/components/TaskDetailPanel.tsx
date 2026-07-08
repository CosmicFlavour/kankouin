import { useState } from "react";
import type { Tag, TaskSummary } from "@/hooks/useTasks";
import { useTaskDetail } from "@/hooks/useTaskDetail";
import { useTags } from "@/hooks/useTags";
import { FUZZY_BUCKETS } from "@/lib/deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PRIORITIES = ["low", "medium", "high"];

function SubtaskSection({ taskId }: { taskId: string }) {
  const { detail, loading, error, addSubtask, toggleSubtask } =
    useTaskDetail(taskId);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    try {
      await addSubtask(newSubtaskTitle.trim());
      setNewSubtaskTitle("");
      setAddError(null);
    } catch (err) {
      setAddError(String(err));
    }
  }

  async function handleToggle(subtaskId: string) {
    try {
      await toggleSubtask(subtaskId);
      setToggleError(null);
    } catch (err) {
      setToggleError(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <h4 className="text-muted-foreground">Subtasks</h4>
      {loading && <p className="text-muted-foreground">Loading...</p>}
      {error && (
        <p className="text-muted-foreground">Couldn't load subtasks: {error}</p>
      )}
      {detail && (
        <div className="flex flex-col gap-1">
          {detail.subtasks.length === 0 && (
            <p className="text-muted-foreground">No subtasks yet</p>
          )}
          {detail.subtasks.map((subtask) => (
            <label key={subtask.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={subtask.done}
                onChange={() => handleToggle(subtask.id)}
              />
              <span
                className={subtask.done ? "text-muted-foreground line-through" : undefined}
              >
                {subtask.title}
              </span>
            </label>
          ))}
        </div>
      )}
      {toggleError && <p className="text-destructive">{toggleError}</p>}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <Input
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          placeholder="New subtask"
        />
        <Button type="submit" size="sm" variant="outline">
          Add subtask
        </Button>
        {addError && <p className="text-destructive">{addError}</p>}
      </form>
    </div>
  );
}

function TagSection({
  workspaceId,
  taskTags,
  onChangeTags,
}: {
  workspaceId: string;
  taskTags: Tag[];
  onChangeTags: (tagIds: string[], allTags: Tag[]) => Promise<void>;
}) {
  const { tags, loading, error, createTag } = useTags(workspaceId);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#888888");
  const [createError, setCreateError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggle(tagId: string) {
    const selectedIds = taskTags.map((t) => t.id);
    const nextIds = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    try {
      await onChangeTags(nextIds, tags);
      setToggleError(null);
    } catch (err) {
      setToggleError(String(err));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      await createTag(newTagName.trim(), newTagColor);
      setNewTagName("");
      setCreateError(null);
    } catch (err) {
      setCreateError(String(err));
    }
  }

  return (
    <div>
      <dt className="text-muted-foreground">Tags</dt>
      <dd className="mt-1 flex flex-col gap-2">
        {loading && <p className="text-muted-foreground">Loading...</p>}
        {error && (
          <p className="text-muted-foreground">Couldn't load tags: {error}</p>
        )}
        {tags.length === 0 && !loading && (
          <p className="text-muted-foreground">No tags in this workspace yet</p>
        )}
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const checked = taskTags.some((t) => t.id === tag.id);
            return (
              <label
                key={tag.id}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggle(tag.id)}
                />
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </label>
            );
          })}
        </div>
        {toggleError && <p className="text-destructive">{toggleError}</p>}

        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="New tag"
            className="h-8"
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className="h-8 w-8 shrink-0 rounded border border-border"
          />
          <Button type="submit" size="sm" variant="outline">
            Add tag
          </Button>
        </form>
        {createError && <p className="text-destructive">{createError}</p>}
      </dd>
    </div>
  );
}

interface TaskDetailPanelProps {
  task: TaskSummary;
  workspaceId: string;
  onClose: () => void;
  onChangeTitle: (title: string) => Promise<void>;
  onChangePriority: (priority: string) => Promise<void>;
  onChangeDescription: (description: string) => Promise<void>;
  onChangeDeadline: (
    deadlineType: "exact" | "fuzzy",
    value: string,
  ) => Promise<void>;
  onChangeTags: (tagIds: string[], allTags: Tag[]) => Promise<void>;
}

export function TaskDetailPanel({
  task,
  workspaceId,
  onClose,
  onChangeTitle,
  onChangePriority,
  onChangeDescription,
  onChangeDeadline,
  onChangeTags,
}: TaskDetailPanelProps) {
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState(
    task.description ?? "",
  );
  const [descriptionError, setDescriptionError] = useState<string | null>(
    null,
  );
  const [deadlineType, setDeadlineType] = useState<"exact" | "fuzzy">(
    task.deadline_type === "fuzzy" ? "fuzzy" : "exact",
  );
  const [deadlineValue, setDeadlineValue] = useState(
    task.deadline_type === "fuzzy"
      ? (task.fuzzy_bucket ?? FUZZY_BUCKETS[0].value)
      : (task.exact_date ?? ""),
  );
  const [deadlineError, setDeadlineError] = useState<string | null>(null);

  async function handleSaveTitle(e: React.FormEvent) {
    e.preventDefault();
    if (!titleDraft.trim()) return;
    try {
      await onChangeTitle(titleDraft.trim());
      setTitleError(null);
    } catch (err) {
      setTitleError(String(err));
    }
  }

  async function handlePriorityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    try {
      await onChangePriority(e.target.value);
      setPriorityError(null);
    } catch (err) {
      setPriorityError(String(err));
    }
  }

  async function handleSaveDescription(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onChangeDescription(descriptionDraft);
      setDescriptionError(null);
    } catch (err) {
      setDescriptionError(String(err));
    }
  }

  function handleDeadlineTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextType = e.target.value as "exact" | "fuzzy";
    setDeadlineType(nextType);
    setDeadlineValue(nextType === "fuzzy" ? FUZZY_BUCKETS[0].value : "");
  }

  async function handleSaveDeadline(e: React.FormEvent) {
    e.preventDefault();
    if (!deadlineValue) return;
    try {
      await onChangeDeadline(deadlineType, deadlineValue);
      setDeadlineError(null);
    } catch (err) {
      setDeadlineError(String(err));
    }
  }

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 border-l border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{task.title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Title</dt>
          <dd>
            <form onSubmit={handleSaveTitle} className="mt-1 flex flex-col gap-2">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
              />
              <Button type="submit" size="sm" variant="outline">
                Save title
              </Button>
              {titleError && (
                <p className="text-sm text-destructive">{titleError}</p>
              )}
            </form>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">State</dt>
          <dd>{task.state}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Priority</dt>
          <dd>
            <select
              value={task.priority}
              onChange={handlePriorityChange}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            {priorityError && (
              <p className="mt-1 text-sm text-destructive">{priorityError}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Description</dt>
          <dd>
            <form onSubmit={handleSaveDescription} className="mt-1 flex flex-col gap-2">
              <Textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="No description"
                rows={4}
              />
              <Button type="submit" size="sm" variant="outline">
                Save description
              </Button>
              {descriptionError && (
                <p className="text-sm text-destructive">{descriptionError}</p>
              )}
            </form>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Deadline</dt>
          <dd>
            <form onSubmit={handleSaveDeadline} className="mt-1 flex flex-col gap-2">
              <select
                value={deadlineType}
                onChange={handleDeadlineTypeChange}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="exact">Exact date</option>
                <option value="fuzzy">Fuzzy</option>
              </select>
              {deadlineType === "exact" ? (
                <Input
                  type="date"
                  value={deadlineValue}
                  onChange={(e) => setDeadlineValue(e.target.value)}
                />
              ) : (
                <select
                  value={deadlineValue}
                  onChange={(e) => setDeadlineValue(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  {FUZZY_BUCKETS.map((bucket) => (
                    <option key={bucket.value} value={bucket.value}>
                      {bucket.label}
                    </option>
                  ))}
                </select>
              )}
              <Button type="submit" size="sm" variant="outline">
                Save deadline
              </Button>
              {deadlineError && (
                <p className="text-sm text-destructive">{deadlineError}</p>
              )}
            </form>
          </dd>
        </div>
        <TagSection
          workspaceId={workspaceId}
          taskTags={task.tags}
          onChangeTags={onChangeTags}
        />
        {task.blocked && (
          <div>
            <dd className="text-destructive">Blocked by another task</dd>
          </div>
        )}
      </dl>

      <SubtaskSection taskId={task.id} />
    </div>
  );
}
