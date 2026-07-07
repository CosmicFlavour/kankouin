import { useState } from "react";
import { useTasks, type TaskSummary } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TaskBoardProps {
  projectId: string;
}

const COLUMNS: { state: TaskSummary["state"]; label: string }[] = [
  { state: "todo", label: "Todo" },
  { state: "doing", label: "Doing" },
  { state: "under_review", label: "Under Review" },
  { state: "done", label: "Done" },
];

export function TaskBoard({ projectId }: TaskBoardProps) {
  const { tasks, loading, error, createTask } = useTasks(projectId);
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

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

      {!loading && !error && (
        <div className="flex gap-4">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter((t) => t.state === column.state);
            return (
              <div key={column.state} className="flex w-56 shrink-0 flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {column.label} ({columnTasks.length})
                </h3>
                <div className="flex flex-col gap-1">
                  {columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      {task.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
