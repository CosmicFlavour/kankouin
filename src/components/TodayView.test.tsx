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

  it("shows each task's tags as colored dots on its row", async () => {
    const urgentTag = { id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "#ff0000" };
    const task = makeTask({
      id: "t1",
      title: "Ship the thing",
      project_id: "p1",
      tags: [urgentTag],
    });
    mockCommands({
      list_tasks_today: () => [task],
      list_workspaces: () => [{ id: "ws-1", name: "Work", color: null, icon: null }],
      list_projects: () => [{ id: "p1", workspace_id: "ws-1", name: "Launch" }],
    });
    render(<TodayView />);

    await screen.findByText("Ship the thing");
    const dot = document.querySelector('[title="urgent"]');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("does not show a tag filter when there are no tasks", async () => {
    mockCommands({
      list_tasks_today: () => [],
      list_workspaces: () => [],
      list_projects: () => [],
    });
    render(<TodayView />);

    await screen.findByText("Nothing overdue or due this week — enjoy it.");
    expect(
      screen.queryByRole("button", { name: /All tags/ }),
    ).not.toBeInTheDocument();
  });

  it("filters the list to tasks matching the selected tag, across workspaces", async () => {
    const urgentTag = { id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "#f00" };
    const laterTag = { id: "tag-2", workspace_id: "ws-2", name: "later", color: "#00f" };
    const taskA = makeTask({
      id: "t1",
      title: "Ship the thing",
      project_id: "p1",
      tags: [urgentTag],
    });
    const taskB = makeTask({
      id: "t2",
      title: "Write the docs",
      project_id: "p2",
      tags: [laterTag],
    });
    mockCommands({
      list_tasks_today: () => [taskA, taskB],
      list_workspaces: () => [
        { id: "ws-1", name: "Work", color: null, icon: null },
        { id: "ws-2", name: "Side project", color: null, icon: null },
      ],
      list_projects: (args) =>
        args?.workspaceId === "ws-1"
          ? [{ id: "p1", workspace_id: "ws-1", name: "Launch" }]
          : [{ id: "p2", workspace_id: "ws-2", name: "Blog" }],
    });
    const user = userEvent.setup();
    render(<TodayView />);

    await screen.findByText("Ship the thing");
    expect(screen.getByText("Write the docs")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /All tags/ }));
    await user.click(await screen.findByRole("checkbox", { name: /urgent/ }));

    expect(screen.getByText("Ship the thing")).toBeInTheDocument();
    expect(screen.queryByText("Write the docs")).not.toBeInTheDocument();
  });
});
