import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { PlusIcon } from "lucide-react";
import { useTasks, type TaskSummary } from "@/hooks/useTasks";
import { useArchivedTasks } from "@/hooks/useArchivedTasks";
import { useTags } from "@/hooks/useTags";
import { TASK_STATES } from "@/lib/taskState";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskColumn } from "@/components/TaskColumn";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { ScopeFilter, type TaskScope } from "@/components/ScopeFilter";
import { TagFilter } from "@/components/TagFilter";
import { PriorityFilter } from "@/components/PriorityFilter";
import { DeadlineFilter } from "@/components/DeadlineFilter";
import { taskDeadlineBucket } from "@/lib/deadline";
import { NewUserStoryDialog } from "@/components/NewUserStoryDialog";
import { NameDialog } from "@/components/NameDialog";

function CreateTaskForm({
  onCreate,
}: {
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await onCreate(title.trim());
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
        />
        <Button type="submit">Create task</Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </>
  );
}

interface TaskBoardProps {
  projectId: string;
  workspaceId: string;
  scope: TaskScope;
  onScopeChange: (scope: TaskScope) => void;
  epics: Epic[];
  epicsLoading: boolean;
  epicsError: string | null;
  onCreateEpic: (title: string) => Promise<unknown>;
  onDeleteEpic: (epicId: string) => Promise<void>;
  userStories: UserStory[];
  storiesLoading: boolean;
  storiesError: string | null;
  onCreateUserStory: (title: string, epicId: string | null) => Promise<unknown>;
  onDeleteUserStory: (storyId: string) => Promise<void>;
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
}

function taskMatchesScope(
  task: TaskSummary,
  scope: TaskScope,
  userStories: UserStory[],
): boolean {
  if (scope === null) return true;
  if (scope.type === "story") return task.user_story_id === scope.id;

  // Epic scope: tasks attached directly to the epic, or to one of its
  // user stories.
  if (task.epic_id === scope.id) return true;
  if (!task.user_story_id) return false;
  const story = userStories.find((s) => s.id === task.user_story_id);
  return story?.epic_id === scope.id;
}

export function TaskBoard({
  projectId,
  workspaceId,
  scope,
  onScopeChange,
  epics,
  epicsLoading,
  epicsError,
  onCreateEpic,
  onDeleteEpic,
  userStories,
  storiesLoading,
  storiesError,
  onCreateUserStory,
  onDeleteUserStory,
  focusTaskId,
  onFocusHandled,
}: TaskBoardProps) {
  const {
    tasks: allTasks,
    loading,
    error,
    refresh: refreshTasks,
    createTask,
    moveTask,
    updateTask,
    setDeadline,
    setTaskTags,
    setTaskParent,
    archiveTask,
    deleteTask,
  } = useTasks(projectId);
  const { tags, loading: tagsLoading, error: tagsError } = useTags(workspaceId);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedDeadlineBuckets, setSelectedDeadlineBuckets] = useState<
    string[]
  >([]);
  const [showHidden, setShowHidden] = useState(false);
  const {
    archivedTasks,
    loading: archivedLoading,
    error: archivedError,
    refresh: refreshArchivedTasks,
    unarchiveTask,
  } = useArchivedTasks(showHidden ? projectId : null);

  useEffect(() => {
    setSelectedTagIds([]);
  }, [projectId]);

  useEffect(() => {
    setSelectedPriorities([]);
  }, [projectId]);

  useEffect(() => {
    setSelectedDeadlineBuckets([]);
  }, [projectId]);

  useEffect(() => {
    setShowHidden(false);
  }, [projectId]);

  const combinedTasks = showHidden ? [...allTasks, ...archivedTasks] : allTasks;
  const tasks = combinedTasks
    .filter((t) => taskMatchesScope(t, scope, userStories))
    .filter(
      (t) =>
        selectedTagIds.length === 0 ||
        t.tags.some((tag) => selectedTagIds.includes(tag.id)),
    )
    .filter(
      (t) =>
        selectedPriorities.length === 0 ||
        selectedPriorities.includes(t.priority),
    )
    .filter(
      (t) =>
        selectedDeadlineBuckets.length === 0 ||
        selectedDeadlineBuckets.includes(taskDeadlineBucket(t) ?? ""),
    );
  // Detail panel stays open for a task even if it falls outside the current
  // scope filter (e.g. it was opened before the scope changed).
  const selectedTask = combinedTasks.find((t) => t.id === selectedTaskId);
  // Create and edit share one Dialog instance (content swaps in place)
  // rather than closing one Dialog and opening another, which can race with
  // Radix's dismiss-on-outside-interaction handling.
  const taskDialogOpen = creatingTask || !!selectedTask;

  function closeTaskDialog() {
    setCreatingTask(false);
    setSelectedTaskId(null);
  }

  async function handleDeleteEpic(epicId: string) {
    await onDeleteEpic(epicId);
    if (scope?.type === "epic" && scope.id === epicId) onScopeChange(null);
  }

  async function handleDeleteUserStory(storyId: string) {
    await onDeleteUserStory(storyId);
    if (scope?.type === "story" && scope.id === storyId) onScopeChange(null);
  }

  // archiveTask/deleteTask only touch the active-task hook's own state, so
  // the hidden list (a different hook instance) needs an explicit refresh
  // to notice — but only if it's actually being shown.
  async function handleArchiveTask(taskId: string) {
    await archiveTask(taskId);
    if (showHidden) refreshArchivedTasks();
  }

  async function handleUnarchiveTask(taskId: string) {
    await unarchiveTask(taskId);
    await refreshTasks();
  }

  async function handleDeleteTask(taskId: string, wasArchived: boolean) {
    await deleteTask(taskId);
    if (wasArchived && showHidden) refreshArchivedTasks();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    if (!focusTaskId) return;
    if (!allTasks.some((t) => t.id === focusTaskId)) return;
    setSelectedTaskId(focusTaskId);
    onFocusHandled?.();
  }, [focusTaskId, allTasks, onFocusHandled]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const newState = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.state === newState) return;

    try {
      await moveTask(taskId, newState);
      setMoveError(null);
    } catch (err) {
      setMoveError(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon-lg"
          className="size-14 shrink-0 rounded-full"
          title="New task"
          onClick={() => setCreatingTask(true)}
        >
          <PlusIcon className="size-6" />
        </Button>

        <NewUserStoryDialog
          trigger={
            <Button type="button" variant="outline" size="lg">
              <PlusIcon /> User Story
            </Button>
          }
          epics={epics}
          defaultEpicId={scope?.type === "epic" ? scope.id : null}
          onCreate={onCreateUserStory}
        />

        <NameDialog
          trigger={
            <Button type="button" variant="outline" size="lg">
              <PlusIcon /> Epic
            </Button>
          }
          title="New epic"
          placeholder="Epic title"
          submitLabel="Create epic"
          onSubmit={onCreateEpic}
        />

        <ScopeFilter
          scope={scope}
          onScopeChange={onScopeChange}
          epics={epics}
          epicsLoading={epicsLoading}
          epicsError={epicsError}
          onDeleteEpic={handleDeleteEpic}
          userStories={userStories}
          storiesLoading={storiesLoading}
          storiesError={storiesError}
          onDeleteUserStory={handleDeleteUserStory}
        />

        <TagFilter
          tags={tags}
          loading={tagsLoading}
          error={tagsError}
          selectedTagIds={selectedTagIds}
          onChange={setSelectedTagIds}
        />

        <PriorityFilter
          selectedPriorities={selectedPriorities}
          onChange={setSelectedPriorities}
        />

        <DeadlineFilter
          selectedBuckets={selectedDeadlineBuckets}
          onChange={setSelectedDeadlineBuckets}
        />

        <div className="flex items-center gap-1.5 text-sm">
          <Switch
            id="show-hidden"
            checked={showHidden}
            onCheckedChange={setShowHidden}
          />
          <label
            htmlFor="show-hidden"
            className="cursor-pointer text-muted-foreground select-none"
          >
            Show hidden
          </label>
          {archivedLoading && (
            <span className="text-xs text-muted-foreground">Loading...</span>
          )}
          {archivedError && (
            <span className="text-xs text-muted-foreground">
              Couldn't load hidden tasks: {archivedError}
            </span>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && (
        <p className="text-sm text-muted-foreground">
          Couldn't load tasks: {error}
        </p>
      )}
      {moveError && <p className="text-sm text-destructive">{moveError}</p>}

      {!loading && !error && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4">
            {TASK_STATES.map((column) => (
              <TaskColumn
                key={column.state}
                state={column.state}
                label={column.label}
                tasks={tasks.filter((t) => t.state === column.state)}
                epics={epics}
                userStories={userStories}
                onSelectTask={setSelectedTaskId}
              />
            ))}
          </div>
        </DndContext>
      )}

      <Dialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeTaskDialog();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {creatingTask && !selectedTask && (
            <CreateTaskForm
              onCreate={async (title) => {
                const created = await createTask(title, {
                  epicId: scope?.type === "epic" ? scope.id : null,
                  userStoryId: scope?.type === "story" ? scope.id : null,
                });
                if (created) {
                  setCreatingTask(false);
                  setSelectedTaskId(created.id);
                }
              }}
            />
          )}
          {selectedTask && (
            <TaskDetailPanel
              key={selectedTask.id}
              task={selectedTask}
              workspaceId={workspaceId}
              epics={epics}
              userStories={userStories}
              onChangeTitle={(title) => updateTask(selectedTask.id, { title })}
              onChangeState={(state) => moveTask(selectedTask.id, state)}
              onChangePriority={(priority) =>
                updateTask(selectedTask.id, { priority })
              }
              onChangeDescription={(description) =>
                updateTask(selectedTask.id, { description })
              }
              onChangeDeadline={(deadlineType, value) =>
                setDeadline(selectedTask.id, deadlineType, value)
              }
              onChangeTags={(tagIds, allTags) =>
                setTaskTags(selectedTask.id, tagIds, allTags)
              }
              onChangeParent={(epicId, userStoryId) =>
                setTaskParent(selectedTask.id, epicId, userStoryId)
              }
              onArchive={async () => {
                await handleArchiveTask(selectedTask.id);
                closeTaskDialog();
              }}
              onUnarchive={async () => {
                await handleUnarchiveTask(selectedTask.id);
                closeTaskDialog();
              }}
              onDelete={async () => {
                await handleDeleteTask(selectedTask.id, selectedTask.archived);
                closeTaskDialog();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
