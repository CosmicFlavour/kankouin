import type { TaskSummary } from "@/hooks/useTasks";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { taskHierarchyLabel } from "@/lib/hierarchy";

export function HierarchyBadge({
  task,
  epics,
  userStories,
}: {
  task: TaskSummary;
  epics: Epic[];
  userStories: UserStory[];
}) {
  const label = taskHierarchyLabel(task, epics, userStories);
  if (!label) return null;

  return (
    <span className="inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}
