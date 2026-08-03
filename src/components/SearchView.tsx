import { useState } from "react";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useProjectDirectory } from "@/hooks/useProjectDirectory";
import { fuzzySearch } from "@/lib/fuzzyMatch";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { Input } from "@/components/ui/input";

export function SearchView() {
  const { tasks, loading, error, refresh } = useAllTasks();
  const { directory, loading: directoryLoading, error: directoryError } =
    useProjectDirectory();
  const [query, setQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const results = fuzzySearch(query, tasks, (t) => t.title);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Search</h2>

      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks by title..."
        className="max-w-xl"
      />

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
          {query.trim() === "" && (
            <p className="text-sm text-muted-foreground">
              Type to search your tasks
            </p>
          )}
          {query.trim() !== "" && results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tasks match "{query.trim()}"
            </p>
          )}
          {results.length > 0 && (
            <div className="flex max-w-xl flex-col gap-1">
              {results.map((task) => {
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
          )}
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
