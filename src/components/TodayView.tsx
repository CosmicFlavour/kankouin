import { useState } from "react";
import { useTasksToday } from "@/hooks/useTasksToday";
import { useProjectDirectory } from "@/hooks/useProjectDirectory";
import { useTags } from "@/hooks/useTags";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { TagFilter, type TagFilterValue } from "@/components/TagFilter";

export function TodayView() {
  const { tasks, loading, error, refresh } = useTasksToday();
  const { directory, loading: directoryLoading, error: directoryError } =
    useProjectDirectory();
  const {
    tags,
    loading: tagsLoading,
    error: tagsError,
  } = useTags();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<TagFilterValue>({
    include: [],
    exclude: [],
  });

  const visibleTasks = tasks
    .filter(
      (t) =>
        tagFilter.include.length === 0 ||
        t.tags.some((tag) => tagFilter.include.includes(tag.id)),
    )
    .filter((t) => !t.tags.some((tag) => tagFilter.exclude.includes(tag.id)));

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

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
            })}
          </div>
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
