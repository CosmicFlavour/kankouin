import type { TaskSummary } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";

interface TaskDetailPanelProps {
  task: TaskSummary;
  onClose: () => void;
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
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
          <dd>{task.priority}</dd>
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
