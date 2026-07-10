import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TaskSummary } from "@/hooks/useTasks";
import { useProjectDirectory } from "@/hooks/useProjectDirectory";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StaleTaskCard } from "@/components/StaleTaskCard";

interface DailyReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: TaskSummary[];
  onFinished: () => void;
}

export function DailyReviewDialog({
  open,
  onOpenChange,
  tasks,
  onFinished,
}: DailyReviewDialogProps) {
  const [queue, setQueue] = useState<TaskSummary[]>([]);
  const [total, setTotal] = useState(0);
  const wasOpen = useRef(false);
  const { directory } = useProjectDirectory();

  // Snapshot the queue only on the closed -> open transition, so resolving
  // or skipping a task doesn't get disrupted by `tasks` changing underneath.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setQueue(tasks);
      setTotal(tasks.length);
    }
    wasOpen.current = open;
  }, [open, tasks]);

  const current = queue[0];
  const resolvedCount = total - queue.length;

  function advance() {
    setQueue((prev) => prev.slice(1));
  }

  function handleOpenChange(next: boolean) {
    if (!next) onFinished();
    onOpenChange(next);
  }

  const location = current
    ? (() => {
        const entry = directory.get(current.project_id);
        return entry ? `${entry.workspaceName} / ${entry.projectName}` : null;
      })()
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {current
              ? `Daily Review (${resolvedCount + 1} of ${total})`
              : "Daily Review"}
          </DialogTitle>
        </DialogHeader>

        {current ? (
          <StaleTaskCard
            key={current.id}
            task={current}
            location={location}
            onMarkDone={async () => {
              await invoke("update_task_state", {
                id: current.id,
                newState: "done",
              });
              advance();
            }}
            onMarkUnderReview={async () => {
              await invoke("update_task_state", {
                id: current.id,
                newState: "under_review",
              });
              advance();
            }}
            onUpdateDeadline={async (deadlineType, value) => {
              await invoke("set_deadline", {
                id: current.id,
                deadlineType,
                exactDate: deadlineType === "exact" ? value : null,
                fuzzyBucket: deadlineType === "fuzzy" ? value : null,
              });
              advance();
            }}
            onSkip={advance}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "Nothing stale right now — nice."
                : "All caught up for today."}
            </p>
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
