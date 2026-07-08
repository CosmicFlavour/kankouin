import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTasks, type TaskSummary } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";

interface TaskBoardProps {
  projectId: string;
  workspaceId: string;
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
}

const COLUMNS: { state: TaskSummary["state"]; label: string }[] = [
  { state: "todo", label: "Todo" },
  { state: "doing", label: "Doing" },
  { state: "under_review", label: "Under Review" },
  { state: "done", label: "Done" },
];

function TaskCard({
  task,
  onSelect,
}: {
  task: TaskSummary;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "flex cursor-grab flex-col gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <span>{task.title}</span>
      <DeadlineBadge task={task} />
    </div>
  );
}

function TaskColumn({
  state,
  label,
  tasks,
  onSelectTask,
}: {
  state: string;
  label: string;
  tasks: TaskSummary[];
  onSelectTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-56 shrink-0 flex-col gap-2 rounded-md p-2",
        isOver && "bg-muted",
      )}
    >
      <h3 className="text-sm font-medium text-muted-foreground">
        {label} ({tasks.length})
      </h3>
      <div className="flex flex-col gap-1">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onSelect={() => onSelectTask(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function TaskBoard({
  projectId,
  workspaceId,
  focusTaskId,
  onFocusHandled,
}: TaskBoardProps) {
  const {
    tasks,
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

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    if (!focusTaskId) return;
    if (!tasks.some((t) => t.id === focusTaskId)) return;
    setSelectedTaskId(focusTaskId);
    onFocusHandled?.();
  }, [focusTaskId, tasks, onFocusHandled]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createTask(title.trim());
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
