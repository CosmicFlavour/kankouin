import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTasks, type TaskSummary } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskColumn } from "@/components/TaskColumn";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import type { TaskScope } from "@/components/HierarchyPanel";

interface TaskBoardProps {
  projectId: string;
  workspaceId: string;
  scope: TaskScope;
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
}

function taskMatchesScope(task: TaskSummary, scope: TaskScope): boolean {
  if (scope === null) return true;
  if (scope.type === "epic") return task.epic_id === scope.id;
  return task.user_story_id === scope.id;
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
  } = useTasks(projectId);
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = allTasks.filter((t) => taskMatchesScope(t, scope));
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createTask(title.trim(), {
        epicId: scope?.type === "epic" ? scope.id : null,
        userStoryId: scope?.type === "story" ? scope.id : null,
      });
      setTitle("");
      setCreateError(null);
    } catch (err) {
      setCreateError(String(err));
    }
  }

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
      <form onSubmit={handleCreate} className="flex max-w-sm flex-col gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title"
        />
        <Button type="submit">Create task</Button>
        {createError && <p className="text-sm text-destructive">{createError}</p>}
      </form>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && (
        <p className="text-sm text-muted-foreground">
          Couldn't load tasks: {error}
        </p>
      )}
      {moveError && <p className="text-sm text-destructive">{moveError}</p>}

      {!loading && !error && (
        <div className="flex gap-4">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="flex gap-4">
              {COLUMNS.map((column) => (
                <TaskColumn
                  key={column.state}
                  state={column.state}
                  label={column.label}
                  tasks={tasks.filter((t) => t.state === column.state)}
                  onSelectTask={setSelectedTaskId}
                />
              ))}
            </div>
          </DndContext>

          {selectedTask && (
            <TaskDetailPanel
              key={selectedTask.id}
              task={selectedTask}
              workspaceId={workspaceId}
              onClose={() => setSelectedTaskId(null)}
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
            />
          )}
        </div>
      )}
    </div>
  );
}
