import { useMemo, useState } from "react";
import { useTasksToday } from "@/hooks/useTasksToday";
import { useProjectDirectory } from "@/hooks/useProjectDirectory";
import type { Tag } from "@/hooks/useTasks";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { TagFilter } from "@/components/TagFilter";

export function TodayView() {
  const { tasks, loading, error, refresh } = useTasksToday();
  const { directory, loading: directoryLoading, error: directoryError } =
    useProjectDirectory();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Tasks here span every workspace, so there's no single workspaceId to
  // fetch tags for (unlike TaskBoard's TagFilter) — the filter options are
  // just whatever tags are actually present on tasks in this list.
  const availableTags = useMemo(() => {
    const byId = new Map<string, Tag>();
    for (const task of tasks) {
      for (const tag of task.tags) byId.set(tag.id, tag);
    }
    return Array.from(byId.values());
  }, [tasks]);

  const visibleTasks = tasks.filter(
    (t) =>
      selectedTagIds.length === 0 ||
      t.tags.some((tag) => selectedTagIds.includes(tag.id)),
  );

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const selectedLocation = selectedTask
    ? directory.get(selectedTask.project_id)
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Today / This Week</h2>
        {tasks.length > 0 && (
          <TagFilter
            tags={availableTags}
            loading={false}
            error={null}
            selectedTagIds={selectedTagIds}
            onChange={setSelectedTagIds}
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
          <div className="flex max-w-xl flex-col gap-1">
            {visibleTasks.map((task) => {
              const location = directory.get(task.project_id);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  disabled={!location}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span className="flex flex-col">
                    <span>{task.title}</span>
                    {location && (
                      <span className="text-xs text-muted-foreground">
                        {location.workspaceName} / {location.projectName}
                      </span>
                    )}
                  </span>
                  <DeadlineBadge task={task} />
                </button>
              );
            })}
          </div>
        </>
      )}

      <TaskDetailDialog
        projectId={selectedTask?.project_id ?? null}
        workspaceId={selectedLocation?.workspaceId ?? null}
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
