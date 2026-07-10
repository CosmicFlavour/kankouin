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
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TaskColumn } from "@/components/TaskColumn";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { ScopeFilter, type TaskScope } from "@/components/ScopeFilter";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { NewUserStoryDialog } from "@/components/NewUserStoryDialog";
import { NameDialog } from "@/components/NameDialog";

interface TaskBoardProps {
  projectId: string;
  workspaceId: string;
  scope: TaskScope;
  onScopeChange: (scope: TaskScope) => void;
  epics: Epic[];
  epicsLoading: boolean;
  epicsError: string | null;
  onCreateEpic: (title: string) => Promise<unknown>;
  userStories: UserStory[];
  storiesLoading: boolean;
  storiesError: string | null;
  onCreateUserStory: (title: string, epicId: string | null) => Promise<unknown>;
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

const COLUMNS: { state: TaskSummary["state"]; label: string }[] = [
  { state: "todo", label: "Todo" },
  { state: "doing", label: "Doing" },
  { state: "under_review", label: "Under Review" },
  { state: "done", label: "Done" },
];

export function TaskBoard({
  projectId,
  workspaceId,
  scope,
  onScopeChange,
  epics,
  epicsLoading,
  epicsError,
  onCreateEpic,
  userStories,
  storiesLoading,
  storiesError,
  onCreateUserStory,
  focusTaskId,
  onFocusHandled,
}: TaskBoardProps) {
  const {
    tasks: allTasks,
    loading,
    error,
    createTask,
    moveTask,
    updateTask,
    setDeadline,
    setTaskTags,
    setTaskParent,
  } = useTasks(projectId);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = allTasks.filter((t) =>
    taskMatchesScope(t, scope, userStories),
  );
  // Detail panel stays open for a task even if it falls outside the current
  // scope filter (e.g. it was opened before the scope changed).
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId);

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
        <NewTaskDialog
          trigger={
            <Button
              type="button"
              size="icon-lg"
              className="size-14 shrink-0 rounded-full"
              title="New task"
            >
              <PlusIcon className="size-6" />
            </Button>
          }
          onCreate={(fields) =>
            createTask(fields, {
              epicId: scope?.type === "epic" ? scope.id : null,
              userStoryId: scope?.type === "story" ? scope.id : null,
            })
          }
        />

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
          userStories={userStories}
          storiesLoading={storiesLoading}
          storiesError={storiesError}
        />
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
            {COLUMNS.map((column) => (
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
        open={!!selectedTask}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {selectedTask && (
            <TaskDetailPanel
              key={selectedTask.id}
              task={selectedTask}
              workspaceId={workspaceId}
              epics={epics}
              userStories={userStories}
              onChangeTitle={(title) => updateTask(selectedTask.id, { title })}
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
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
