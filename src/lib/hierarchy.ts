import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import type { TaskSummary } from "@/hooks/useTasks";

// "Epic / Story" breadcrumb for a task's parent, using "-" for whichever
// half doesn't apply (e.g. "Launch / -" for a task attached directly to an
// epic, "- / -" for a task attached to the bare project).
export function taskHierarchyBreadcrumb(
  task: TaskSummary,
  epics: Epic[],
  userStories: UserStory[],
): string {
  if (task.user_story_id) {
    const story = userStories.find((s) => s.id === task.user_story_id);
    const epicTitle = story?.epic_id
      ? epics.find((e) => e.id === story.epic_id)?.title
      : undefined;
    return `${epicTitle ?? "-"} / ${story?.title ?? "-"}`;
  }
  if (task.epic_id) {
    const epic = epics.find((e) => e.id === task.epic_id);
    return `${epic?.title ?? "-"} / -`;
  }
  return "- / -";
}
