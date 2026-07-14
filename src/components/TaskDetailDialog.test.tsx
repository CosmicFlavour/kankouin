import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { mockCommands, mockConfirm } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

function baseMocks(
  taskOverrides: Partial<ReturnType<typeof makeTask>> = {},
  extraHandlers: Record<string, (args?: Record<string, unknown>) => unknown> = {},
) {
  const task = makeTask({ id: "t1", title: "Ship the thing", ...taskOverrides });
  mockCommands({
    list_tasks: () => [task],
    list_epics: () => [],
    list_user_stories: () => [],
    list_tags: () => [],
    get_task: () => ({ subtasks: [], tags: [], blocked_by: [] }),
    ...extraHandlers,
  });
  return task;
}

describe("TaskDetailDialog", () => {
  it("renders nothing when there's no selected task", () => {
    baseMocks();
    render(
      <TaskDetailDialog
        projectId={null}
        workspaceId={null}
        taskId={null}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Ship the thing")).not.toBeInTheDocument();
  });

  it("loads the selected task from its own project scope and shows it", async () => {
    baseMocks();
    render(
      <TaskDetailDialog
        projectId="project-1"
        workspaceId="ws-1"
        taskId="t1"
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Ship the thing")).toBeInTheDocument();
  });

  it("closes the dialog after archiving is confirmed", async () => {
    baseMocks({}, { archive_task: () => undefined });
    mockConfirm.mockResolvedValue(true);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskDetailDialog
        projectId="project-1"
        workspaceId="ws-1"
        taskId="t1"
        onOpenChange={onOpenChange}
      />,
    );
    await screen.findByText("Ship the thing");

    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("closes the dialog after deletion is confirmed", async () => {
    baseMocks({}, { delete_task: () => undefined });
    mockConfirm.mockResolvedValue(true);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskDetailDialog
        projectId="project-1"
        workspaceId="ws-1"
        taskId="t1"
        onOpenChange={onOpenChange}
      />,
    );
    await screen.findByText("Ship the thing");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
