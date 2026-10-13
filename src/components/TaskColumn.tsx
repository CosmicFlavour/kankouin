import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
  dotClassName = "bg-muted-foreground/50",
  columnClassName = "bg-muted/40",
}: {
  state: string;
  label: string;
  tasks: TaskSummary[];
  epics: Epic[];
  userStories: UserStory[];
  onSelectTask: (taskId: string) => void;
  dotClassName?: string;
  columnClassName?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-56 shrink-0 flex-col gap-2 rounded-md p-2",
        columnClassName,
        isOver && "bg-muted",
      )}
    >
      <div className="flex items-center gap-1.5 px-1">
        <span className={cn("size-1.5 shrink-0 rounded-full", dotClassName)} />
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <span className="ml-auto rounded-full bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
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
      </SortableContext>
    </div>
  );
}
