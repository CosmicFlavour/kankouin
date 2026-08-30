import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "./AIChatSidebar";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

function mockBackend(overrides: Record<string, () => unknown> = {}) {
  mockCommands({
    get_settings: () => ({
      last_sync_file_path: null,
      theme: null,
      ai_connection: null,
    }),
    ...overrides,
  });
}

function renderSidebar(
  overrides: Partial<Parameters<typeof AIChatSidebar>[0]> = {},
) {
  const onMutation = vi.fn();
  render(
    <AIChatSidebar
      open
      projectId="project-1"
      workspaceId="workspace-1"
      projectName="Website Redesign"
      workspaceName="Personal"
      onMutation={onMutation}
      {...overrides}
    />,
  );
  return { onMutation };
}

describe("AIChatSidebar", () => {
  it("shows a placeholder when there are no messages yet", () => {
    mockBackend();
    renderSidebar();

    expect(
      screen.getByText(/ask me to break a task down/i),
    ).toBeInTheDocument();
  });

  it("sends a message on button click and renders both sides of the exchange", async () => {
    const user = userEvent.setup();
    mockBackend({
      chat_with_ai: () => ({ reply: "Here's a plan.", actions: [] }),
    });
    renderSidebar();

    const textarea = screen.getByPlaceholderText("Message the AI assistant…");
    await user.type(textarea, "Break this down");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Here's a plan.")).toBeInTheDocument();
    expect(screen.getByText("Break this down")).toBeInTheDocument();
    expect(textarea).toHaveValue("");
    expect(mockInvoke).toHaveBeenCalledWith("chat_with_ai", {
      message: "Break this down",
      projectId: "project-1",
      workspaceId: "workspace-1",
      projectName: "Website Redesign",
      workspaceName: "Personal",
    });
  });

  it("sends a message on Enter without Shift, but not with Shift", async () => {
    const user = userEvent.setup();
    mockBackend({ chat_with_ai: () => ({ reply: "ok", actions: [] }) });
    renderSidebar();

    const textarea = screen.getByPlaceholderText("Message the AI assistant…");
    await user.type(textarea, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "chat_with_ai",
      expect.anything(),
    );

    await user.type(textarea, "{Enter}");
    expect(mockInvoke).toHaveBeenCalledWith(
      "chat_with_ai",
      expect.objectContaining({ message: "Line one\nLine two" }),
    );
  });

  it("calls onMutation after a successful reply", async () => {
    const user = userEvent.setup();
    mockBackend({ chat_with_ai: () => ({ reply: "done", actions: [] }) });
    const { onMutation } = renderSidebar();

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "add a subtask",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("done");
    expect(onMutation).toHaveBeenCalled();
  });

  it("shows an error when the backend call fails", async () => {
    const user = userEvent.setup();
    mockBackend({
      chat_with_ai: () => {
        throw new Error("ai backend unavailable");
      },
    });
    renderSidebar();

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "hello",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Error: ai backend unavailable"),
    ).toBeInTheDocument();
  });

  it("clears the transcript when New conversation is clicked", async () => {
    const user = userEvent.setup();
    mockBackend({
      chat_with_ai: () => ({ reply: "hi there", actions: [] }),
      reset_ai_conversation: () => undefined,
    });
    renderSidebar();

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "hello",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("hi there");

    await user.click(
      screen.getByRole("button", { name: "New conversation" }),
    );

    expect(mockInvoke).toHaveBeenCalledWith("reset_ai_conversation");
    expect(screen.queryByText("hi there")).not.toBeInTheDocument();
    expect(
      screen.getByText(/ask me to break a task down/i),
    ).toBeInTheDocument();
  });

  it("shows a collapsible action trail with a working revert button", async () => {
    const user = userEvent.setup();
    mockBackend({
      chat_with_ai: () => ({
        reply: "Archived it.",
        actions: [
          {
            id: "log-1",
            tool_name: "archive_task",
            summary: 'Archived "Fix login bug"',
            task_id: "task-1",
            revertible: true,
            reverted_at: null,
          },
        ],
      }),
      revert_ai_action: () => ({}),
    });
    const { onMutation } = renderSidebar();

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "archive it",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Archived it.");
    onMutation.mockClear();

    // Collapsed by default.
    expect(screen.queryByText('Archived "Fix login bug"')).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "1 action taken" }));
    expect(screen.getByText('Archived "Fix login bug"')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revert" }));

    expect(mockInvoke).toHaveBeenCalledWith("revert_ai_action", {
      id: "log-1",
    });
    expect(
      screen.queryByRole("button", { name: "Revert" }),
    ).not.toBeInTheDocument();
    expect(onMutation).toHaveBeenCalled();
  });

  it("does not show a revert button for a non-revertible action", async () => {
    const user = userEvent.setup();
    mockBackend({
      chat_with_ai: () => ({
        reply: "Created it.",
        actions: [
          {
            id: "log-1",
            tool_name: "create_task",
            summary: 'Created task "New"',
            task_id: "task-1",
            revertible: false,
            reverted_at: null,
          },
        ],
      }),
    });
    renderSidebar();

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "create a task",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Created it.");

    await user.click(screen.getByRole("button", { name: "1 action taken" }));

    expect(screen.getByText('Created task "New"')).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revert" }),
    ).not.toBeInTheDocument();
  });
});
