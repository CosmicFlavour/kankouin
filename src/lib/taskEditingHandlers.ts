import type { Tag } from "@/hooks/useTasks";

interface TaskMutations {
  updateTask: (
    taskId: string,
    fields: { title?: string; description?: string; priority?: string },
  ) => Promise<void>;
  moveTask: (taskId: string, newState: string) => Promise<void>;
  setDeadline: (
    taskId: string,
    deadlineType: "exact" | "fuzzy",
    value: string,
  ) => Promise<void>;
  setTaskTags: (taskId: string, tagIds: string[], allTags: Tag[]) => Promise<void>;
  setTaskParent: (
    taskId: string,
    epicId: string | null,
    userStoryId: string | null,
  ) => Promise<void>;
}

// TaskDetailPanel's edit callbacks (everything except archive/unarchive/
// delete, whose semantics genuinely differ per caller — e.g. TaskBoard also
// refreshes its archived-tasks list) are the same useTasks(projectId)
// bindings wherever the panel is opened from — shared here so TaskBoard and
// TaskDetailDialog don't each hand-write the same seven one-liners.
export function taskEditingHandlers(tasks: TaskMutations, taskId: string) {
  return {
    onChangeTitle: (title: string) => tasks.updateTask(taskId, { title }),
    onChangeState: (state: string) => tasks.moveTask(taskId, state),
    onChangePriority: (priority: string) =>
      tasks.updateTask(taskId, { priority }),
    onChangeDescription: (description: string) =>
      tasks.updateTask(taskId, { description }),
    onChangeDeadline: (deadlineType: "exact" | "fuzzy", value: string) =>
      tasks.setDeadline(taskId, deadlineType, value),
    onChangeTags: (tagIds: string[], allTags: Tag[]) =>
      tasks.setTaskTags(taskId, tagIds, allTags),
    onChangeParent: (epicId: string | null, userStoryId: string | null) =>
      tasks.setTaskParent(taskId, epicId, userStoryId),
  };
}
