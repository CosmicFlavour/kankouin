import { useTasks } from "@/hooks/useTasks";
import { useEpics } from "@/hooks/useEpics";
import { useUserStories } from "@/hooks/useUserStories";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { taskEditingHandlers } from "@/lib/taskEditingHandlers";

interface TaskDetailDialogProps {
  projectId: string | null;
  workspaceId: string | null;
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
}

// A standalone task-editing dialog for views that list tasks across
// projects (currently just Today / This Week) rather than owning a single
// project's board — it instantiates its own useTasks/useEpics/useUserStories
// scoped to whichever project the selected task belongs to, so opening a
// task doesn't require navigating into that project's TaskBoard first.
export function TaskDetailDialog({
  projectId,
  workspaceId,
  taskId,
  onOpenChange,
}: TaskDetailDialogProps) {
  const tasksApi = useTasks(projectId);
  const { tasks, archiveTask, deleteTask } = tasksApi;
  const { epics } = useEpics(projectId);
  const { userStories } = useUserStories(projectId);

  const task = tasks.find((t) => t.id === taskId);

  return (
    <Dialog open={!!taskId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        {task && workspaceId && (
          <TaskDetailPanel
            key={task.id}
            task={task}
            workspaceId={workspaceId}
            epics={epics}
            userStories={userStories}
            {...taskEditingHandlers(tasksApi, task.id)}
            onArchive={async () => {
              await archiveTask(task.id);
              onOpenChange(false);
            }}
            // This dialog only ever shows tasks pulled from a list that
            // already excludes archived ones (e.g. list_today), so the
            // "restore" affordance in TaskDetailPanel has nothing to call.
            onUnarchive={async () => {}}
            onDelete={async () => {
              await deleteTask(task.id);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
