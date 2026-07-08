import { useDraggable } from "@dnd-kit/core";
import type { TaskSummary } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { DeadlineBadge } from "@/components/DeadlineBadge";

export function TaskCard({
  task,
  onSelect,
}: {
  task: TaskSummary;
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
        "flex cursor-grab flex-col gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <span>{task.title}</span>
      <DeadlineBadge task={task} />
    </div>
  );
}
