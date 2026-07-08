import { useState } from "react";
import type { Tag, TaskSummary } from "@/hooks/useTasks";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { FUZZY_BUCKETS } from "@/lib/deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SubtaskSection } from "@/components/SubtaskSection";
import { TagSection } from "@/components/TagSection";

const PRIORITIES = ["low", "medium", "high"];

interface TaskDetailPanelProps {
  task: TaskSummary;
  workspaceId: string;
  epics: Epic[];
  userStories: UserStory[];
  onChangeTitle: (title: string) => Promise<void>;
  onChangePriority: (priority: string) => Promise<void>;
  onChangeDescription: (description: string) => Promise<void>;
  onChangeDeadline: (
    deadlineType: "exact" | "fuzzy",
    value: string,
  ) => Promise<void>;
  onChangeTags: (tagIds: string[], allTags: Tag[]) => Promise<void>;
  onChangeParent: (
    epicId: string | null,
    userStoryId: string | null,
  ) => Promise<void>;
}

export function TaskDetailPanel({
  task,
  workspaceId,
  epics,
  userStories,
  onChangeTitle,
  onChangePriority,
  onChangeDescription,
  onChangeDeadline,
  onChangeTags,
  onChangeParent,
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
  const [parentError, setParentError] = useState<string | null>(null);

  const parentValue = task.user_story_id
    ? `story:${task.user_story_id}`
    : task.epic_id
      ? `epic:${task.epic_id}`
      : "";

  function storyLabel(story: UserStory) {
    const epicTitle = epics.find((e) => e.id === story.epic_id)?.title;
    return epicTitle ? `${epicTitle} / ${story.title}` : story.title;
  }

  async function handleParentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    try {
      if (value.startsWith("epic:")) {
        await onChangeParent(value.slice("epic:".length), null);
      } else if (value.startsWith("story:")) {
        await onChangeParent(null, value.slice("story:".length));
      } else {
        await onChangeParent(null, null);
      }
      setParentError(null);
    } catch (err) {
      setParentError(String(err));
    }
  }

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
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{task.title}</DialogTitle>
      </DialogHeader>

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
        <div>
          <dt className="text-muted-foreground">Parent</dt>
          <dd>
            <select
              value={parentValue}
              onChange={handleParentChange}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">Project only</option>
              {epics.map((epic) => (
                <option key={epic.id} value={`epic:${epic.id}`}>
                  {epic.title}
                </option>
              ))}
              {userStories.map((story) => (
                <option key={story.id} value={`story:${story.id}`}>
                  {storyLabel(story)}
                </option>
              ))}
            </select>
            {parentError && (
              <p className="mt-1 text-sm text-destructive">{parentError}</p>
            )}
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
