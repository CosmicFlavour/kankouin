import { describe, it, expect, vi } from "vitest";
import { taskEditingHandlers } from "./taskEditingHandlers";

function makeMutations() {
  return {
    updateTask: vi.fn().mockResolvedValue(undefined),
    moveTask: vi.fn().mockResolvedValue(undefined),
    setDeadline: vi.fn().mockResolvedValue(undefined),
    setTaskTags: vi.fn().mockResolvedValue(undefined),
    setTaskParent: vi.fn().mockResolvedValue(undefined),
  };
}

describe("taskEditingHandlers", () => {
  it("binds each callback to updateTask with the right field", () => {
    const tasks = makeMutations();
    const handlers = taskEditingHandlers(tasks, "t1");

    handlers.onChangeTitle("New title");
    expect(tasks.updateTask).toHaveBeenCalledWith("t1", { title: "New title" });

    handlers.onChangePriority("high");
    expect(tasks.updateTask).toHaveBeenCalledWith("t1", { priority: "high" });

    handlers.onChangeDescription("New description");
    expect(tasks.updateTask).toHaveBeenCalledWith("t1", {
      description: "New description",
    });
  });

  it("binds onChangeState to moveTask", () => {
    const tasks = makeMutations();
    const handlers = taskEditingHandlers(tasks, "t1");

    handlers.onChangeState("doing");

    expect(tasks.moveTask).toHaveBeenCalledWith("t1", "doing");
  });

  it("binds onChangeDeadline to setDeadline", () => {
    const tasks = makeMutations();
    const handlers = taskEditingHandlers(tasks, "t1");

    handlers.onChangeDeadline("fuzzy", "this_week");

    expect(tasks.setDeadline).toHaveBeenCalledWith("t1", "fuzzy", "this_week");
  });

  it("binds onChangeTags to setTaskTags", () => {
    const tasks = makeMutations();
    const handlers = taskEditingHandlers(tasks, "t1");
    const allTags = [{ id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "#f00" }];

    handlers.onChangeTags(["tag-1"], allTags);

    expect(tasks.setTaskTags).toHaveBeenCalledWith("t1", ["tag-1"], allTags);
  });

  it("binds onChangeParent to setTaskParent", () => {
    const tasks = makeMutations();
    const handlers = taskEditingHandlers(tasks, "t1");

    handlers.onChangeParent("epic-1", null);

    expect(tasks.setTaskParent).toHaveBeenCalledWith("t1", "epic-1", null);
  });
});
