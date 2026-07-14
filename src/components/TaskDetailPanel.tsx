import { useEffect, useState } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import { confirm } from "@/hooks/useConfirm";
import type { Tag, TaskSummary } from "@/hooks/useTasks";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import {
  FUZZY_BUCKETS,
  fuzzyBucketClassName,
  isValidDateString,
} from "@/lib/deadline";
import { priorityButtonClassName } from "@/lib/priority";
import { TASK_STATES } from "@/lib/taskState";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubtaskSection } from "@/components/SubtaskSection";
import { TagSection } from "@/components/TagSection";
import { DatePickerPopover } from "@/components/DatePickerPopover";
import { toast } from "@/hooks/useToast";

const PRIORITIES = ["low", "medium", "high"];

// Radix's Select.Item forbids an empty-string value, so "no epic/story
// parent" needs its own sentinel to round-trip through onValueChange.
const NO_PARENT = "__no_parent__";

interface TaskDetailPanelProps {
  task: TaskSummary;
  workspaceId: string;
  epics: Epic[];
  userStories: UserStory[];
  onChangeTitle: (title: string) => Promise<void>;
  onChangeState: (state: string) => Promise<void>;
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
  onArchive: () => Promise<void>;
  onUnarchive: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function TaskDetailPanel({
  task,
  workspaceId,
  epics,
  userStories,
  onChangeTitle,
  onChangeState,
  onChangePriority,
  onChangeDescription,
  onChangeDeadline,
  onChangeTags,
  onChangeParent,
  onArchive,
  onUnarchive,
  onDelete,
}: TaskDetailPanelProps) {
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [dangerError, setDangerError] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState(
    task.description ?? "",
  );
  const [descriptionError, setDescriptionError] = useState<string | null>(
    null,
  );
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [exactDateDraft, setExactDateDraft] = useState(
    task.deadline_type === "exact" ? (task.exact_date ?? "") : "",
  );
  const [parentError, setParentError] = useState<string | null>(null);

  // Clicking a fuzzy bucket or switching parent selection can change
  // task.deadline_type without remounting this component (same task id), so
  // the draft needs to stay in sync with the task rather than just seeding
  // once.
  useEffect(() => {
    setExactDateDraft(
      task.deadline_type === "exact" ? (task.exact_date ?? "") : "",
    );
  }, [task.deadline_type, task.exact_date]);

  const parentValue = task.user_story_id
    ? `story:${task.user_story_id}`
    : task.epic_id
      ? `epic:${task.epic_id}`
      : NO_PARENT;

  function storyLabel(story: UserStory) {
    const epicTitle = epics.find((e) => e.id === story.epic_id)?.title;
    return epicTitle ? `${epicTitle} / ${story.title}` : story.title;
  }

  async function handleParentChange(value: string) {
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

  async function saveTitleIfChanged() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === task.title) return;
    try {
      await onChangeTitle(trimmed);
      setTitleError(null);
    } catch (err) {
      setTitleError(String(err));
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }

  async function handleStateChange(state: string) {
    if (state === task.state) return;
    try {
      await onChangeState(state);
      setStateError(null);
    } catch (err) {
      setStateError(String(err));
    }
  }

  async function handlePriorityChange(priority: string) {
    if (priority === task.priority) return;
    try {
      await onChangePriority(priority);
      setPriorityError(null);
    } catch (err) {
      setPriorityError(String(err));
    }
  }

  async function saveDescriptionIfChanged() {
    if (descriptionDraft === (task.description ?? "")) return;
    try {
      await onChangeDescription(descriptionDraft);
      setDescriptionError(null);
    } catch (err) {
      setDescriptionError(String(err));
    }
  }

  async function handleFuzzyBucketClick(bucket: string) {
    if (task.deadline_type === "fuzzy" && task.fuzzy_bucket === bucket) return;
    try {
      await onChangeDeadline("fuzzy", bucket);
      setDeadlineError(null);
    } catch (err) {
      setDeadlineError(String(err));
    }
  }

  async function commitExactDate(value: string) {
    if (task.deadline_type === "exact" && value === task.exact_date) return;
    if (!isValidDateString(value)) {
      setDeadlineError("Use YYYY-MM-DD");
      return;
    }
    try {
      await onChangeDeadline("exact", value);
      setDeadlineError(null);
    } catch (err) {
      setDeadlineError(String(err));
    }
  }

  async function saveExactDateIfChanged() {
    const trimmed = exactDateDraft.trim();
    if (!trimmed) return;
    await commitExactDate(trimmed);
  }

  async function handleArchive() {
    setDangerError(null);
    const confirmed = await confirm(
      `Archive "${task.title}"? It will be hidden from the board. This can be changed later.`,
      { title: "Archive task?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await onArchive();
      toast({ title: "Task archived", description: task.title });
    } catch (err) {
      setDangerError(String(err));
    }
  }

  // No confirmation needed: restoring is the reversible side of archive,
  // not a destructive action.
  async function handleUnarchive() {
    setDangerError(null);
    try {
      await onUnarchive();
      toast({ title: "Task restored", description: task.title });
    } catch (err) {
      setDangerError(String(err));
    }
  }

  async function handleDelete() {
    setDangerError(null);
    const confirmed = await confirm(
      `Permanently delete "${task.title}"? Its subtasks, notes and tags will be deleted too. This can't be undone.`,
      { title: "Delete task?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await onDelete();
      toast({ title: "Task deleted", description: task.title });
    } catch (err) {
      setDangerError(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <div className="flex items-center justify-between gap-2 pr-6">
          <DialogTitle>{task.title}</DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={task.archived ? handleUnarchive : handleArchive}
            >
              {task.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              <span className="sr-only">
                {task.archived ? "Restore" : "Archive"}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2Icon />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        </div>
      </DialogHeader>
      {dangerError && <p className="text-sm text-destructive">{dangerError}</p>}

      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Title</dt>
          <dd className="mt-1">
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitleIfChanged}
              onKeyDown={handleTitleKeyDown}
            />
            {titleError && (
              <p className="mt-1 text-sm text-destructive">{titleError}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">State</dt>
          <dd>
            <div className="mt-1 inline-flex overflow-hidden rounded-md border border-border">
              {TASK_STATES.map((s, i) => (
                <button
                  key={s.state}
                  type="button"
                  onClick={() => handleStateChange(s.state)}
                  className={cn(
                    "px-3 py-1 text-sm transition-colors",
                    i > 0 && "border-l border-border",
                    task.state === s.state
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {stateError && (
              <p className="mt-1 text-sm text-destructive">{stateError}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Priority</dt>
          <dd>
            <div className="mt-1 inline-flex overflow-hidden rounded-md border border-border">
              {PRIORITIES.map((priority, i) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() => handlePriorityChange(priority)}
                  className={cn(
                    "px-3 py-1 text-sm capitalize transition-colors",
                    i > 0 && "border-l border-border",
                    priorityButtonClassName(priority, task.priority === priority),
                  )}
                >
                  {priority}
                </button>
              ))}
            </div>
            {priorityError && (
              <p className="mt-1 text-sm text-destructive">{priorityError}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Description</dt>
          <dd className="mt-1">
            <Textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onBlur={saveDescriptionIfChanged}
              placeholder="No description"
              rows={4}
            />
            {descriptionError && (
              <p className="mt-1 text-sm text-destructive">{descriptionError}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Deadline</dt>
          <dd className="mt-1 flex flex-col gap-2">
            <div className="inline-flex w-fit overflow-hidden rounded-md border border-border">
              {FUZZY_BUCKETS.map((bucket, i) => (
                <button
                  key={bucket.value}
                  type="button"
                  onClick={() => handleFuzzyBucketClick(bucket.value)}
                  className={cn(
                    "px-3 py-1 text-sm transition-colors",
                    i > 0 && "border-l border-border",
                    task.deadline_type === "fuzzy" &&
                      task.fuzzy_bucket === bucket.value
                      ? fuzzyBucketClassName(bucket.value)
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {bucket.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={exactDateDraft}
                onChange={(e) => setExactDateDraft(e.target.value)}
                onBlur={saveExactDateIfChanged}
              />
              <DatePickerPopover
                value={
                  task.deadline_type === "exact" ? (task.exact_date ?? "") : ""
                }
                onSelect={commitExactDate}
              />
            </div>
            {deadlineError && (
              <p className="text-sm text-destructive">{deadlineError}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Parent</dt>
          <dd>
            <Select value={parentValue} onValueChange={handleParentChange}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>Project only</SelectItem>
                {epics.map((epic) => (
                  <SelectItem key={epic.id} value={`epic:${epic.id}`}>
                    {epic.title}
                  </SelectItem>
                ))}
                {userStories.map((story) => (
                  <SelectItem key={story.id} value={`story:${story.id}`}>
                    {storyLabel(story)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <div className="flex items-center justify-end border-t border-border pt-4">
        <DialogClose asChild>
          <Button type="button">Apply</Button>
        </DialogClose>
      </div>
    </div>
  );
}
