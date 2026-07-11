import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import type { TaskSummary } from "@/hooks/useTasks";

export function makeTask(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: "task-1",
    project_id: "project-1",
    epic_id: null,
    user_story_id: null,
    title: "Task",
    description: null,
    state: "todo",
    priority: "medium",
    deadline_type: null,
    exact_date: null,
    fuzzy_bucket: null,
    bucket_period: null,
    state_since: "2026-07-11T00:00:00Z",
    archived: false,
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    tags: [],
    blocked: false,
    ...overrides,
  };
}

export function makeEpic(overrides: Partial<Epic> = {}): Epic {
  return {
    id: "epic-1",
    project_id: "project-1",
    title: "Epic",
    description: null,
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

export function makeUserStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: "story-1",
    project_id: "project-1",
    epic_id: null,
    title: "Story",
    description: null,
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}
