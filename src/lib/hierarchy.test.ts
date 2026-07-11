import { describe, it, expect } from "vitest";
import { taskHierarchyBreadcrumb } from "./hierarchy";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import type { TaskSummary } from "@/hooks/useTasks";

function makeTask(overrides: Partial<TaskSummary> = {}): TaskSummary {
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

function makeEpic(overrides: Partial<Epic> = {}): Epic {
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

function makeUserStory(overrides: Partial<UserStory> = {}): UserStory {
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

describe("taskHierarchyBreadcrumb", () => {
  it("shows '- / -' for a task attached to the bare project", () => {
    const task = makeTask();
    expect(taskHierarchyBreadcrumb(task, [], [])).toBe("- / -");
  });

  it("shows 'Epic / -' for a task attached directly to an epic", () => {
    const epic = makeEpic({ id: "epic-1", title: "Launch" });
    const task = makeTask({ epic_id: "epic-1" });
    expect(taskHierarchyBreadcrumb(task, [epic], [])).toBe("Launch / -");
  });

  it("shows '- / Story' for a task attached to a story with no epic", () => {
    const story = makeUserStory({ id: "story-1", title: "Onboarding", epic_id: null });
    const task = makeTask({ user_story_id: "story-1" });
    expect(taskHierarchyBreadcrumb(task, [], [story])).toBe("- / Onboarding");
  });

  it("shows 'Epic / Story' for a task attached to a story that belongs to an epic", () => {
    const epic = makeEpic({ id: "epic-1", title: "Launch" });
    const story = makeUserStory({
      id: "story-1",
      title: "Onboarding",
      epic_id: "epic-1",
    });
    const task = makeTask({ user_story_id: "story-1" });
    expect(taskHierarchyBreadcrumb(task, [epic], [story])).toBe(
      "Launch / Onboarding",
    );
  });

  it("prefers the user story over a directly-attached epic when both are set", () => {
    const epic = makeEpic({ id: "epic-1", title: "Directly attached" });
    const story = makeUserStory({ id: "story-1", title: "Via story", epic_id: null });
    const task = makeTask({ epic_id: "epic-1", user_story_id: "story-1" });
    expect(taskHierarchyBreadcrumb(task, [epic], [story])).toBe(
      "- / Via story",
    );
  });

  it("falls back to '-' when the referenced epic or story can't be found", () => {
    const task = makeTask({ user_story_id: "missing-story" });
    expect(taskHierarchyBreadcrumb(task, [], [])).toBe("- / -");
  });
});
