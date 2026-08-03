import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchView } from "./SearchView";
import { mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

function baseMocks(tasks = [makeTask({ id: "t1", title: "Ship the thing", project_id: "p1" })]) {
  mockCommands({
    list_all_tasks: () => tasks,
    list_workspaces: () => [{ id: "ws-1", name: "Work", color: null, icon: null }],
    list_projects: () => [{ id: "p1", workspace_id: "ws-1", name: "Launch" }],
    list_tasks: () => tasks,
    list_epics: () => [],
    list_user_stories: () => [],
    list_tags: () => [],
    get_task: () => ({ subtasks: [], tags: [], blocked_by: [] }),
  });
  return tasks;
}

describe("SearchView", () => {
  it("shows a hint and no results before typing", async () => {
    baseMocks();
    render(<SearchView />);

    expect(
      await screen.findByText("Type to search your tasks"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ship the thing")).not.toBeInTheDocument();
  });

  it("filters to matching tasks, tolerating typos and partial words", async () => {
    baseMocks();
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByText("Type to search your tasks");

    await user.type(
      screen.getByPlaceholderText("Search tasks by title..."),
      "shp thg",
    );

    expect(await screen.findByText("Ship the thing")).toBeInTheDocument();
  });

  it("shows a no-match hint when nothing fuzzy-matches", async () => {
    baseMocks();
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByText("Type to search your tasks");

    await user.type(
      screen.getByPlaceholderText("Search tasks by title..."),
      "zzz",
    );

    expect(await screen.findByText('No tasks match "zzz"')).toBeInTheDocument();
  });

  it("excludes tasks that don't match while keeping ones that do", async () => {
    baseMocks([
      makeTask({ id: "t1", title: "Ship the thing", project_id: "p1" }),
      makeTask({ id: "t2", title: "Buy groceries", project_id: "p1" }),
    ]);
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByText("Type to search your tasks");

    await user.type(
      screen.getByPlaceholderText("Search tasks by title..."),
      "groceries",
    );

    expect(await screen.findByText("Buy groceries")).toBeInTheDocument();
    expect(screen.queryByText("Ship the thing")).not.toBeInTheDocument();
  });

  it("opens the task detail dialog when a result is clicked", async () => {
    baseMocks();
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByText("Type to search your tasks");

    await user.type(
      screen.getByPlaceholderText("Search tasks by title..."),
      "ship",
    );
    await user.click(await screen.findByText("Ship the thing"));

    expect(await screen.findByDisplayValue("Ship the thing")).toBeInTheDocument();
  });
});
