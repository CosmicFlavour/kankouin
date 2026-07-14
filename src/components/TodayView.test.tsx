import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodayView } from "./TodayView";
import { mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

function baseMocks() {
  const task = makeTask({ id: "t1", title: "Ship the thing", project_id: "p1" });
  mockCommands({
    list_tasks_today: () => [task],
    list_workspaces: () => [{ id: "ws-1", name: "Work", color: null, icon: null }],
    list_projects: () => [{ id: "p1", workspace_id: "ws-1", name: "Launch" }],
    list_tasks: () => [task],
    list_epics: () => [],
    list_user_stories: () => [],
    list_tags: () => [],
    get_task: () => ({ subtasks: [], tags: [], blocked_by: [] }),
  });
  return task;
}

describe("TodayView", () => {
  it("opens the task detail dialog in place instead of navigating away", async () => {
    baseMocks();
    const user = userEvent.setup();
    render(<TodayView />);

    const taskButton = await screen.findByRole("button", {
      name: /Ship the thing/,
    });
    await user.click(taskButton);

    // The dialog renders the same task's editable title field, proving it
    // opened right here rather than requiring a navigation elsewhere.
    expect(await screen.findByDisplayValue("Ship the thing")).toBeInTheDocument();
    // The Today list itself is still on screen underneath.
    expect(taskButton).toBeInTheDocument();
  });
});
