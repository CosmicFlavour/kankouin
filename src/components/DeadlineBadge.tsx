import type { TaskSummary } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import {
  exactDateUrgency,
  formatExactDate,
  fuzzyBucketClassName,
  fuzzyBucketLabel,
} from "@/lib/deadline";

export function DeadlineBadge({ task }: { task: TaskSummary }) {
  if (task.deadline_type === "exact" && task.exact_date) {
    const urgency = exactDateUrgency(task.exact_date);
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-xs font-medium",
          urgency === "normal"
            ? "border-border text-muted-foreground"
            : "border-destructive/50 bg-destructive/10 text-destructive",
        )}
      >
        {formatExactDate(task.exact_date)}
      </span>
    );
  }

  if (task.deadline_type === "fuzzy" && task.fuzzy_bucket) {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
          fuzzyBucketClassName(task.fuzzy_bucket),
        )}
      >
        {fuzzyBucketLabel(task.fuzzy_bucket)}
      </span>
    );
  }

  return null;
}
