import { useDraggable } from "@dnd-kit/core";
import type { TaskSummary } from "@/hooks/useTasks";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { cn } from "@/lib/utils";
import { taskHierarchyBreadcrumb } from "@/lib/hierarchy";
import { priorityCardClassName } from "@/lib/priority";
import { DeadlineBadge } from "@/components/DeadlineBadge";

export function TaskCard({
  task,
  epics,
  userStories,
  onSelect,
}: {
  task: TaskSummary;
  epics: Epic[];
  userStories: UserStory[];
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "flex cursor-grab flex-col gap-1 rounded-md border px-3 py-2 text-sm active:cursor-grabbing",
        priorityCardClassName(task.priority),
        isDragging && "opacity-50",
      )}
    >
      <span className="text-xs text-muted-foreground">
        {taskHierarchyBreadcrumb(task, epics, userStories)}
      </span>
      <span>{task.title}</span>
      <div className="h-5">
        <DeadlineBadge task={task} />
      </div>
      <div className="flex h-3 items-center gap-1">
        {task.tags.map((tag) => (
          <span
            key={tag.id}
            title={tag.name}
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
        ))}
      </div>
    </div>
  );
}
