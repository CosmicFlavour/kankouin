import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTasksToday } from "@/hooks/useTasksToday";
import { useProjectDirectory } from "@/hooks/useProjectDirectory";
import { useTags } from "@/hooks/useTags";
import type { TaskSummary } from "@/hooks/useTasks";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { TagFilter, type TagFilterValue } from "@/components/TagFilter";
import { resolveDropOrderIndex } from "@/lib/reorder";
import { cn } from "@/lib/utils";

function SortableTaskRow({
  task,
  location,
  onSelect,
}: {
  task: TaskSummary;
  location: { workspaceName: string; projectName: string } | undefined;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      onClick={onSelect}
      disabled={!location}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50",
        isDragging && "opacity-50",
      )}
    >
      <span className="flex flex-col">
        <span>{task.title}</span>
        {location && (
          <span className="text-xs text-muted-foreground">
            {location.workspaceName} / {location.projectName}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {task.tags.length > 0 && (
          <span className="flex items-center gap-1">
            {task.tags.map((tag) => (
              <span
                key={tag.id}
                title={tag.name}
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
            ))}
          </span>
        )}
        <DeadlineBadge task={task} />
      </span>
    </button>
  );
}

export function TodayView() {
  const { tasks, loading, error, refresh, reorderTask } = useTasksToday();
  const { directory, loading: directoryLoading, error: directoryError } =
    useProjectDirectory();
  const {
    tags,
    loading: tagsLoading,
    error: tagsError,
  } = useTags();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<TagFilterValue>({
    include: [],
    exclude: [],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const visibleTasks = tasks
    .filter(
      (t) =>
        tagFilter.include.length === 0 ||
        t.tags.some((tag) => tagFilter.include.includes(tag.id)),
    )
    .filter((t) => !t.tags.some((tag) => tagFilter.exclude.includes(tag.id)));

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const taskId = String(active.id);
    const overId = String(over.id);
    const orderIndex = resolveDropOrderIndex(visibleTasks, taskId, overId);

    try {
      await reorderTask(taskId, orderIndex);
      setReorderError(null);
    } catch (err) {
      setReorderError(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Today / This Week</h2>
        {tasks.length > 0 && (
          <TagFilter
            tags={tags}
            loading={tagsLoading}
            error={tagsError}
            value={tagFilter}
            onChange={setTagFilter}
          />
        )}
      </div>

      {(loading || directoryLoading) && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}
      {(error || directoryError) && (
        <p className="text-sm text-muted-foreground">
          Couldn't load tasks: {error ?? directoryError}
        </p>
      )}
      {reorderError && (
        <p className="text-sm text-destructive">{reorderError}</p>
      )}
      {!loading && !directoryLoading && !error && !directoryError && (
        <>
          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing overdue or due this week — enjoy it.
            </p>
          )}
          {tasks.length > 0 && visibleTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tasks match the selected tags.
            </p>
          )}
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex max-w-xl flex-col gap-1">
                {visibleTasks.map((task) => (
                  <SortableTaskRow
                    key={task.id}
                    task={task}
                    location={directory.get(task.project_id)}
                    onSelect={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <TaskDetailDialog
        projectId={selectedTask?.project_id ?? null}
        taskId={selectedTaskId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTaskId(null);
            refresh();
          }
        }}
      />
    </div>
  );
}
