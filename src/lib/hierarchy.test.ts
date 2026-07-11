import { describe, it, expect } from "vitest";
import { taskHierarchyBreadcrumb } from "./hierarchy";
import { makeTask, makeEpic, makeUserStory } from "@/test/factories";

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
