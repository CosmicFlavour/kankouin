import { useTasksToday } from "@/hooks/useTasksToday";
import { useProjectDirectory } from "@/hooks/useProjectDirectory";
import { DeadlineBadge } from "@/components/DeadlineBadge";

interface TodayViewProps {
  onNavigate: (workspaceId: string, projectId: string, taskId: string) => void;
}

export function TodayView({ onNavigate }: TodayViewProps) {
  const { tasks, loading, error } = useTasksToday();
  const { directory, loading: directoryLoading, error: directoryError } =
    useProjectDirectory();

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
                  onClick={() =>
                    location &&
                    onNavigate(location.workspaceId, task.project_id, task.id)
                  }
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
    </div>
  );
}
