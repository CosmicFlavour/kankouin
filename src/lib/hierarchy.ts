import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import type { TaskSummary } from "@/hooks/useTasks";

export function taskHierarchyLabel(
  task: TaskSummary,
  epics: Epic[],
  userStories: UserStory[],
): string | null {
  if (task.user_story_id) {
    return userStories.find((s) => s.id === task.user_story_id)?.title ?? null;
  }
  if (task.epic_id) {
    return epics.find((e) => e.id === task.epic_id)?.title ?? null;
  }
  return null;
}
