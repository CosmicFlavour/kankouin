import { useState } from "react";
import { useTasksToday } from "@/hooks/useTasksToday";
import { useProjectDirectory } from "@/hooks/useProjectDirectory";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";

export function TodayView() {
  const { tasks, loading, error, refresh } = useTasksToday();
  const { directory, loading: directoryLoading, error: directoryError } =
    useProjectDirectory();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const selectedLocation = selectedTask
    ? directory.get(selectedTask.project_id)
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Today / This Week</h2>

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
          <div className="flex max-w-xl flex-col gap-1">
            {tasks.map((task) => {
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
