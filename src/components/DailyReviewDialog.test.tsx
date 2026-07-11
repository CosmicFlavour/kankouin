import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DailyReviewDialog } from "./DailyReviewDialog";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

const taskA = makeTask({ id: "task-a", title: "Write draft", project_id: "p1" });
const taskB = makeTask({ id: "task-b", title: "Review PR", project_id: "p1" });

function renderDialog(tasks = [taskA, taskB], onFinished = vi.fn()) {
  mockCommands({
    list_workspaces: () => [],
    update_task_state: () => undefined,
    set_deadline: () => undefined,
  });
  const onOpenChange = vi.fn();
  render(
    <DailyReviewDialog
      open
      onOpenChange={onOpenChange}
      tasks={tasks}
      onFinished={onFinished}
    />,
  );
  return { onOpenChange, onFinished };
}

describe("DailyReviewDialog", () => {
  it("shows the first task and a 1-of-N counter", async () => {
    renderDialog();
    expect(await screen.findByText("Daily Review (1 of 2)")).toBeInTheDocument();
    expect(screen.getByText("Write draft")).toBeInTheDocument();
  });

  it("advances to the next task after marking one done", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Write draft");

    await user.click(screen.getByRole("button", { name: "Mark Done" }));

    expect(await screen.findByText("Review PR")).toBeInTheDocument();
    expect(screen.getByText("Daily Review (2 of 2)")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("update_task_state", {
      id: "task-a",
      newState: "done",
    });
  });

  it("advances to the next task after skipping, without calling any command", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Write draft");

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(await screen.findByText("Review PR")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "update_task_state",
      expect.anything(),
    );
  });

  it("shows a completion message once the queue is empty", async () => {
    const user = userEvent.setup();
    renderDialog([taskA]);
    await screen.findByText("Write draft");

    await user.click(screen.getByRole("button", { name: "Mark Done" }));

    expect(await screen.findByText("All caught up for today.")).toBeInTheDocument();
    expect(screen.getByText("Daily Review")).toBeInTheDocument();
  });

  it("shows a friendlier message when there was nothing stale to begin with", async () => {
    renderDialog([]);
    expect(
      await screen.findByText("Nothing stale right now — nice."),
    ).toBeInTheDocument();
  });

  it("calls onFinished when the dialog is closed", async () => {
    const user = userEvent.setup();
    const { onFinished, onOpenChange } = renderDialog([]);
    await screen.findByText("Nothing stale right now — nice.");

    // Radix's own dialog also renders an "X" icon button with an sr-only
    // "Close" label, so disambiguate: ours is the first (visible) one.
    const [ownCloseButton] = screen.getAllByRole("button", { name: "Close" });
    await user.click(ownCloseButton);

    expect(onFinished).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("updating the deadline advances the queue", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Write draft");

    const dateInput = screen.getByDisplayValue("");
    await user.type(dateInput, "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Update deadline" }));

    expect(await screen.findByText("Review PR")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("set_deadline", {
      id: "task-a",
      deadlineType: "exact",
      exactDate: "2026-08-01",
      fuzzyBucket: null,
    });
  });

  it("does not reshuffle the queue while a task is being resolved mid-review", async () => {
    // tasks prop changing underneath (e.g. a background refresh) shouldn't
    // reset progress once the dialog is open — only a closed->open
    // transition re-snapshots the queue (see DailyReviewDialog.tsx:29).
    const user = userEvent.setup();
    mockCommands({ list_workspaces: () => [], update_task_state: () => undefined });
    const { rerender } = render(
      <DailyReviewDialog
        open
        onOpenChange={vi.fn()}
        tasks={[taskA, taskB]}
        onFinished={vi.fn()}
      />,
    );
    await screen.findByText("Write draft");

    rerender(
      <DailyReviewDialog
        open
        onOpenChange={vi.fn()}
        tasks={[taskB]}
        onFinished={vi.fn()}
      />,
    );

    expect(screen.getByText("Write draft")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Done" }));
    expect(await screen.findByText("Review PR")).toBeInTheDocument();
  });
});
