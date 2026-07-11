import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { Dialog } from "@/components/ui/dialog";
import { mockCommands } from "@/test/tauriMock";
import { makeTask, makeEpic, makeUserStory } from "@/test/factories";
import type { TaskSummary } from "@/hooks/useTasks";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";

function makeHandlers() {
  return {
    onChangeTitle: vi.fn().mockResolvedValue(undefined),
    onChangeState: vi.fn().mockResolvedValue(undefined),
    onChangePriority: vi.fn().mockResolvedValue(undefined),
    onChangeDescription: vi.fn().mockResolvedValue(undefined),
    onChangeDeadline: vi.fn().mockResolvedValue(undefined),
    onChangeTags: vi.fn().mockResolvedValue(undefined),
    onChangeParent: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPanel(
  taskOverrides: Partial<TaskSummary> = {},
  { epics = [], userStories = [] }: { epics?: Epic[]; userStories?: UserStory[] } = {},
) {
  // TaskDetailPanel embeds TagSection (useTags) and SubtaskSection
  // (useTaskDetail) internally — give both something inert to fetch so they
  // don't render "couldn't load" noise that could collide with assertions.
  mockCommands({
    list_tags: () => [],
    get_task: () => ({ subtasks: [], tags: [], logs: [], blocked_by: [] }),
  });
  const task = makeTask({ id: "t1", title: "Ship the thing", ...taskOverrides });
  const handlers = makeHandlers();
  render(
    // DialogHeader/DialogTitle inside TaskDetailPanel need a Radix Dialog
    // context, same as when TaskBoard renders it inside its own <Dialog>.
    <Dialog open>
      <TaskDetailPanel
        task={task}
        workspaceId="ws-1"
        epics={epics}
        userStories={userStories}
        {...handlers}
      />
    </Dialog>,
  );
  return { task, handlers };
}

describe("TaskDetailPanel — title", () => {
  it("saves the trimmed title on blur when it changed", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel();

    const input = screen.getByDisplayValue("Ship the thing");
    await user.clear(input);
    await user.type(input, "  Ship it faster  ");
    await user.tab();

    expect(handlers.onChangeTitle).toHaveBeenCalledWith("Ship it faster");
  });

  it("does not save when the title is unchanged", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel();

    await user.click(screen.getByDisplayValue("Ship the thing"));
    await user.tab();

    expect(handlers.onChangeTitle).not.toHaveBeenCalled();
  });

  it("does not save an empty title", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel();

    const input = screen.getByDisplayValue("Ship the thing");
    await user.clear(input);
    await user.tab();

    expect(handlers.onChangeTitle).not.toHaveBeenCalled();
  });

  it("pressing Enter blurs the field and saves it", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel();

    const input = screen.getByDisplayValue("Ship the thing");
    await user.clear(input);
    await user.type(input, "New title{Enter}");

    expect(handlers.onChangeTitle).toHaveBeenCalledWith("New title");
  });

  it("shows an error when saving the title fails", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel();
    handlers.onChangeTitle.mockRejectedValue(new Error("title taken"));

    const input = screen.getByDisplayValue("Ship the thing");
    await user.clear(input);
    await user.type(input, "New title");
    await user.tab();

    expect(await screen.findByText("Error: title taken")).toBeInTheDocument();
  });
});

describe("TaskDetailPanel — state", () => {
  it("clicking a different state calls onChangeState", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ state: "todo" });

    await user.click(screen.getByRole("button", { name: "Doing" }));

    expect(handlers.onChangeState).toHaveBeenCalledWith("doing");
  });

  it("clicking the current state is a no-op", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ state: "todo" });

    await user.click(screen.getByRole("button", { name: "Todo" }));

    expect(handlers.onChangeState).not.toHaveBeenCalled();
  });

  it("shows an error when the state change fails", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ state: "todo" });
    handlers.onChangeState.mockRejectedValue(new Error("blocked by another task"));

    await user.click(screen.getByRole("button", { name: "Doing" }));

    expect(
      await screen.findByText("Error: blocked by another task"),
    ).toBeInTheDocument();
  });
});

describe("TaskDetailPanel — priority", () => {
  it("clicking a different priority calls onChangePriority", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ priority: "medium" });

    await user.click(screen.getByRole("button", { name: "high" }));

    expect(handlers.onChangePriority).toHaveBeenCalledWith("high");
  });

  it("clicking the current priority is a no-op", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ priority: "medium" });

    await user.click(screen.getByRole("button", { name: "medium" }));

    expect(handlers.onChangePriority).not.toHaveBeenCalled();
  });

  it("shows an error when the priority change fails", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ priority: "medium" });
    handlers.onChangePriority.mockRejectedValue(new Error("boom"));

    await user.click(screen.getByRole("button", { name: "high" }));

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });
});

describe("TaskDetailPanel — description", () => {
  it("saves the description on blur when it changed", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ description: "Old" });

    const textarea = screen.getByDisplayValue("Old");
    await user.clear(textarea);
    await user.type(textarea, "New description");
    await user.tab();

    expect(handlers.onChangeDescription).toHaveBeenCalledWith("New description");
  });

  it("does not save when the description is unchanged", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ description: "Old" });

    await user.click(screen.getByDisplayValue("Old"));
    await user.tab();

    expect(handlers.onChangeDescription).not.toHaveBeenCalled();
  });
});

describe("TaskDetailPanel — fuzzy deadline", () => {
  it("clicking a fuzzy bucket sets the deadline", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ deadline_type: null });

    await user.click(screen.getByRole("button", { name: "This Week" }));

    expect(handlers.onChangeDeadline).toHaveBeenCalledWith("fuzzy", "this_week");
  });

  it("clicking the already-selected bucket is a no-op", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({
      deadline_type: "fuzzy",
      fuzzy_bucket: "this_week",
    });

    await user.click(screen.getByRole("button", { name: "This Week" }));

    expect(handlers.onChangeDeadline).not.toHaveBeenCalled();
  });

  it("shows an error when setting a fuzzy deadline fails", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ deadline_type: null });
    handlers.onChangeDeadline.mockRejectedValue(new Error("boom"));

    await user.click(screen.getByRole("button", { name: "This Week" }));

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });
});

describe("TaskDetailPanel — exact deadline", () => {
  it("commits a valid exact date on blur", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ deadline_type: null });

    const input = screen.getByPlaceholderText("YYYY-MM-DD");
    await user.type(input, "2026-08-01");
    await user.tab();

    expect(handlers.onChangeDeadline).toHaveBeenCalledWith("exact", "2026-08-01");
  });

  it("rejects a malformed date without calling onChangeDeadline", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ deadline_type: null });

    const input = screen.getByPlaceholderText("YYYY-MM-DD");
    await user.type(input, "not-a-date");
    await user.tab();

    expect(await screen.findByText("Use YYYY-MM-DD")).toBeInTheDocument();
    expect(handlers.onChangeDeadline).not.toHaveBeenCalled();
  });

  it("leaves an empty draft alone on blur", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ deadline_type: null });

    await user.click(screen.getByPlaceholderText("YYYY-MM-DD"));
    await user.tab();

    expect(handlers.onChangeDeadline).not.toHaveBeenCalled();
    expect(screen.queryByText("Use YYYY-MM-DD")).not.toBeInTheDocument();
  });
});

describe("TaskDetailPanel — parent", () => {
  const epic = makeEpic({ id: "epic-1", title: "Launch" });
  const story = makeUserStory({ id: "story-1", title: "Onboarding", epic_id: null });

  it("selecting an epic calls onChangeParent with the epic id", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({}, { epics: [epic] });

    await user.selectOptions(screen.getByRole("combobox"), "epic:epic-1");

    expect(handlers.onChangeParent).toHaveBeenCalledWith("epic-1", null);
  });

  it("selecting a user story calls onChangeParent with the story id", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({}, { userStories: [story] });

    await user.selectOptions(screen.getByRole("combobox"), "story:story-1");

    expect(handlers.onChangeParent).toHaveBeenCalledWith(null, "story-1");
  });

  it("selecting 'Project only' clears the parent", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ epic_id: "epic-1" }, { epics: [epic] });

    await user.selectOptions(screen.getByRole("combobox"), "");

    expect(handlers.onChangeParent).toHaveBeenCalledWith(null, null);
  });

  it("shows an error when reparenting fails", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({}, { epics: [epic] });
    handlers.onChangeParent.mockRejectedValue(new Error("boom"));

    await user.selectOptions(screen.getByRole("combobox"), "epic:epic-1");

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });
});

describe("TaskDetailPanel — blocked indicator", () => {
  it("shows a blocked indicator when the task is blocked", () => {
    renderPanel({ blocked: true });
    expect(screen.getByText("Blocked by another task")).toBeInTheDocument();
  });

  it("does not show a blocked indicator otherwise", () => {
    renderPanel({ blocked: false });
    expect(screen.queryByText("Blocked by another task")).not.toBeInTheDocument();
  });
});
