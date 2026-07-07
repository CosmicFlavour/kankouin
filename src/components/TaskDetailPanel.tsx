import { useState } from "react";
import type { TaskSummary } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";

const PRIORITIES = ["low", "medium", "high"];

interface TaskDetailPanelProps {
  task: TaskSummary;
  onClose: () => void;
  onChangePriority: (priority: string) => Promise<void>;
}

export function TaskDetailPanel({
  task,
  onClose,
  onChangePriority,
}: TaskDetailPanelProps) {
  const [priorityError, setPriorityError] = useState<string | null>(null);

  async function handlePriorityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    try {
      await onChangePriority(e.target.value);
      setPriorityError(null);
    } catch (err) {
      setPriorityError(String(err));
    }
  }

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 border-l border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{task.title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">State</dt>
          <dd>{task.state}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Priority</dt>
          <dd>
            <select
              value={task.priority}
              onChange={handlePriorityChange}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            {priorityError && (
              <p className="mt-1 text-sm text-destructive">{priorityError}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Description</dt>
          <dd>{task.description || "No description"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tags</dt>
          <dd>
            {task.tags.length > 0
              ? task.tags.map((tag) => tag.name).join(", ")
              : "None"}
          </dd>
        </div>
        {task.blocked && (
          <div>
            <dd className="text-destructive">Blocked by another task</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
