import { useDroppable } from "@dnd-kit/core";
import type { TaskSummary } from "@/hooks/useTasks";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/TaskCard";

export function TaskColumn({
  state,
  label,
  tasks,
  epics,
  userStories,
  onSelectTask,
}: {
  state: string;
  label: string;
  tasks: TaskSummary[];
  epics: Epic[];
  userStories: UserStory[];
  onSelectTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-56 shrink-0 flex-col gap-2 rounded-md p-2",
        isOver && "bg-muted",
      )}
    >
      <h3 className="text-sm font-medium text-muted-foreground">
        {label} ({tasks.length})
      </h3>
      <div className="flex flex-col gap-1">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            epics={epics}
            userStories={userStories}
            onSelect={() => onSelectTask(task.id)}
          />
        ))}
      </div>
    </div>
  );
}
