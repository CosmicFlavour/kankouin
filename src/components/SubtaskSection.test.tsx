import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskSection } from "./SubtaskSection";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const subtask = {
  id: "st1",
  task_id: "t1",
  title: "Write draft",
  done: false,
  sort_order: 0,
  created_at: "2026-07-11T00:00:00Z",
};

describe("SubtaskSection", () => {
  it("shows a placeholder when there are no subtasks", async () => {
    mockCommands({
      get_task: () => ({ task: {}, subtasks: [], tags: [], logs: [], blocked_by: [] }),
    });
    render(<SubtaskSection taskId="t1" />);

    expect(await screen.findByText("No subtasks yet")).toBeInTheDocument();
  });

  it("renders existing subtasks", async () => {
    mockCommands({
      get_task: () => ({
        task: {},
        subtasks: [subtask],
        tags: [],
        logs: [],
        blocked_by: [],
      }),
    });
    render(<SubtaskSection taskId="t1" />);

    expect(await screen.findByText("Write draft")).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    mockCommands({
      get_task: () => {
        throw new Error("boom");
      },
    });
    render(<SubtaskSection taskId="t1" />);

    expect(
      await screen.findByText("Couldn't load subtasks: Error: boom"),
    ).toBeInTheDocument();
  });

  it("adds a subtask and clears the input", async () => {
    const user = userEvent.setup();
    mockCommands({
      get_task: () => ({ task: {}, subtasks: [], tags: [], logs: [], blocked_by: [] }),
      add_subtask: () => subtask,
    });
    render(<SubtaskSection taskId="t1" />);
    await screen.findByText("No subtasks yet");

    const input = screen.getByPlaceholderText("New subtask");
    await user.type(input, "Write draft");
    await user.click(screen.getByRole("button", { name: "Add subtask" }));

    expect(await screen.findByText("Write draft")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(mockInvoke).toHaveBeenCalledWith("add_subtask", {
      taskId: "t1",
      title: "Write draft",
    });
  });

  it("does not add a subtask with a blank title", async () => {
    const user = userEvent.setup();
    mockCommands({
      get_task: () => ({ task: {}, subtasks: [], tags: [], logs: [], blocked_by: [] }),
    });
    render(<SubtaskSection taskId="t1" />);
    await screen.findByText("No subtasks yet");

    await user.click(screen.getByRole("button", { name: "Add subtask" }));

    await waitFor(() =>
      expect(mockInvoke).not.toHaveBeenCalledWith(
        "add_subtask",
        expect.anything(),
      ),
    );
  });

  it("shows an error when adding a subtask fails", async () => {
    const user = userEvent.setup();
    mockCommands({
      get_task: () => ({ task: {}, subtasks: [], tags: [], logs: [], blocked_by: [] }),
      add_subtask: () => {
        throw new Error("title too long");
      },
    });
    render(<SubtaskSection taskId="t1" />);
    await screen.findByText("No subtasks yet");

    await user.type(screen.getByPlaceholderText("New subtask"), "x".repeat(300));
    await user.click(screen.getByRole("button", { name: "Add subtask" }));

    expect(await screen.findByText("Error: title too long")).toBeInTheDocument();
  });

  it("toggles a subtask when its checkbox is clicked", async () => {
    const user = userEvent.setup();
    mockCommands({
      get_task: () => ({
        task: {},
        subtasks: [subtask],
        tags: [],
        logs: [],
        blocked_by: [],
      }),
      toggle_subtask: () => ({ ...subtask, done: true }),
    });
    render(<SubtaskSection taskId="t1" />);
    const checkbox = await screen.findByRole("checkbox");

    await user.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    expect(mockInvoke).toHaveBeenCalledWith("toggle_subtask", { id: "st1" });
  });

  it("shows an error when toggling a subtask fails", async () => {
    const user = userEvent.setup();
    mockCommands({
      get_task: () => ({
        task: {},
        subtasks: [subtask],
        tags: [],
        logs: [],
        blocked_by: [],
      }),
      toggle_subtask: () => {
        throw new Error("boom");
      },
    });
    render(<SubtaskSection taskId="t1" />);
    const checkbox = await screen.findByRole("checkbox");

    await user.click(checkbox);

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });
});
