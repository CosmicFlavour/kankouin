import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TaskListProps {
  projectId: string;
}

export function TaskList({ projectId }: TaskListProps) {
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
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">Tasks</h3>

      <div className="flex flex-col gap-1">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {error && (
          <p className="text-sm text-muted-foreground">
            Couldn't load tasks: {error}
          </p>
        )}
        {!loading && !error && tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks yet</p>
        )}
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>{task.title}</span>
            <span className="text-xs text-muted-foreground">{task.state}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate} className="flex max-w-sm flex-col gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title"
        />
        <Button type="submit">Create task</Button>
        {createError && <p className="text-sm text-destructive">{createError}</p>}
      </form>
    </div>
  );
}
