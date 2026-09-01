import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "./AIChatSidebar";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { acceptConfirm } from "@/test/confirmDialog";

function mockBackend(overrides: Record<string, () => unknown> = {}) {
  mockCommands({
    get_settings: () => ({
      last_sync_file_path: null,
      theme: null,
      ai_connection: null,
      ai_system_prompt: null,
    }),
    get_default_ai_system_prompt: () => "You are the default assistant.",
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
      revert_ai_action: () => ({ status: "reverted", task: {} }),
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
      force: false,
    });
    expect(
      screen.queryByRole("button", { name: "Revert" }),
    ).not.toBeInTheDocument();
    expect(onMutation).toHaveBeenCalled();
  });

  it("asks for confirmation before reverting an action whose task changed since", async () => {
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
      revert_ai_action: (args) =>
        args?.force
          ? { status: "reverted", task: {} }
          : { status: "needs_confirmation" },
    });
    render(
      <>
        <AIChatSidebar
          open
          projectId="project-1"
          workspaceId="workspace-1"
          projectName="Website Redesign"
          workspaceName="Personal"
          onMutation={() => {}}
        />
        <ConfirmDialog />
      </>,
    );

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "archive it",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Archived it.");
    await user.click(screen.getByRole("button", { name: "1 action taken" }));

    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(
      await screen.findByText(/task changed since this action/i),
    ).toBeInTheDocument();

    await acceptConfirm(user);

    expect(mockInvoke).toHaveBeenCalledWith("revert_ai_action", {
      id: "log-1",
      force: true,
    });
    expect(
      screen.queryByRole("button", { name: "Revert" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the input editable and shows a spinner while a reply is pending", async () => {
    const user = userEvent.setup();
    let resolveReply!: (value: { reply: string; actions: never[] }) => void;
    mockBackend({
      chat_with_ai: () =>
        new Promise((resolve) => {
          resolveReply = resolve;
        }),
    });
    renderSidebar();

    const textarea = screen.getByPlaceholderText("Message the AI assistant…");
    await user.type(textarea, "first message");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    // The user's own message shows up immediately, without waiting on the reply.
    expect(screen.getByText("first message")).toBeInTheDocument();
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();

    // The textarea is free again, so the user can queue up their next message.
    expect(textarea).not.toBeDisabled();
    await user.type(textarea, "queued while waiting");
    expect(textarea).toHaveValue("queued while waiting");

    // The send button stays disabled until the current turn resolves, so
    // there's no double-send race.
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    resolveReply({ reply: "done", actions: [] });
    await screen.findByText("done");
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("resizes when the drag handle is dragged", async () => {
    mockBackend();
    const { container } = render(
      <AIChatSidebar
        open
        projectId="project-1"
        workspaceId="workspace-1"
        projectName="Website Redesign"
        workspaceName="Personal"
        onMutation={() => {}}
      />,
    );

    const aside = container.querySelector("aside")!;
    const handle = aside.firstElementChild as HTMLElement;
    const initialWidth = aside.style.width;

    // The drag-move listener is wired up from an effect, so the "isResizing"
    // state update from pointerdown needs to commit before pointermove does
    // anything.
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 500 }),
      );
    });
    await act(async () => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 300 }),
      );
    });
    await act(async () => {
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    expect(aside.style.width).not.toBe(initialWidth);
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
