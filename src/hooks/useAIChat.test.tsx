import { describe, it, expect, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAIChat } from "./useAIChat";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { acceptConfirm, declineConfirm } from "@/test/confirmDialog";

describe("useAIChat", () => {
  it("sends the message with project/workspace context and appends the reply", async () => {
    mockCommands({
      chat_with_ai: () => ({
        reply: "Sure, I can help with that.",
        actions: [],
      }),
    });

    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", "Website Redesign", "Personal"),
    );

    await act(async () => {
      await result.current.sendMessage("Break this task down");
    });

    expect(mockInvoke).toHaveBeenCalledWith("chat_with_ai", {
      message: "Break this task down",
      projectId: "project-1",
      workspaceId: "workspace-1",
      projectName: "Website Redesign",
      workspaceName: "Personal",
    });
    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Break this task down" }),
      expect.objectContaining({
        role: "assistant",
        content: "Sure, I can help with that.",
        actions: [],
      }),
    ]);
    expect(result.current.error).toBeNull();
  });

  it("stores the turn's actions alongside the assistant message", async () => {
    const actions = [
      {
        id: "log-1",
        tool_name: "archive_task",
        summary: 'Archived "Fix login bug"',
        task_id: "task-1",
        revertible: true,
        reverted_at: null,
      },
    ];
    mockCommands({
      chat_with_ai: () => ({ reply: "Done.", actions }),
    });
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null),
    );

    await act(async () => {
      await result.current.sendMessage("archive it");
    });

    expect(result.current.messages[1].actions).toEqual(actions);
  });

  it("ignores a blank message", async () => {
    mockCommands({ chat_with_ai: () => ({ reply: "unused", actions: [] }) });
    const { result } = renderHook(() => useAIChat(null, null, null, null));

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it("surfaces a failure without appending an assistant message", async () => {
    mockCommands({
      chat_with_ai: () => {
        throw new Error("ai backend unavailable");
      },
    });
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null),
    );

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await waitFor(() =>
      expect(result.current.error).toBe("Error: ai backend unavailable"),
    );
    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: "user", content: "hello" }),
    ]);
  });

  // A tool call earlier in the same turn can have already mutated the db
  // before a later step (another tool call, the follow-up provider call,
  // the orchestrator's iteration cap) fails — so a failed turn is never
  // proof nothing happened. onMutation must still fire so the board
  // doesn't go stale relative to what the AI actually did.
  it("still calls onMutation when the backend call fails", async () => {
    mockCommands({
      chat_with_ai: () => {
        throw new Error("ai backend unavailable");
      },
    });
    const onMutation = vi.fn();
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null, onMutation),
    );

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("calls onMutation exactly once after a successful reply", async () => {
    mockCommands({ chat_with_ai: () => ({ reply: "done", actions: [] }) });
    const onMutation = vi.fn();
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null, onMutation),
    );

    await act(async () => {
      await result.current.sendMessage("add a subtask");
    });

    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("resetConversation clears the transcript", async () => {
    mockCommands({
      chat_with_ai: () => ({ reply: "hi", actions: [] }),
      reset_ai_conversation: () => undefined,
    });
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null),
    );

    await act(async () => {
      await result.current.sendMessage("hello");
    });
    expect(result.current.messages.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.resetConversation();
    });

    expect(result.current.messages).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("reset_ai_conversation");
  });

  it("revertAction marks the matching action reverted and calls onMutation", async () => {
    const actions = [
      {
        id: "log-1",
        tool_name: "archive_task",
        summary: 'Archived "Fix login bug"',
        task_id: "task-1",
        revertible: true,
        reverted_at: null,
      },
    ];
    mockCommands({
      chat_with_ai: () => ({ reply: "Done.", actions }),
      revert_ai_action: () => ({ status: "reverted", task: {} }),
    });
    const onMutation = vi.fn();
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null, onMutation),
    );

    await act(async () => {
      await result.current.sendMessage("archive it");
    });
    onMutation.mockClear();

    await act(async () => {
      await result.current.revertAction("log-1");
    });

    expect(mockInvoke).toHaveBeenCalledWith("revert_ai_action", {
      id: "log-1",
      force: false,
    });
    expect(result.current.messages[1].actions?.[0].reverted_at).not.toBeNull();
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("revertAction surfaces an error without crashing", async () => {
    mockCommands({
      revert_ai_action: () => {
        throw new Error("already reverted");
      },
    });
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null),
    );

    await act(async () => {
      await result.current.revertAction("log-1");
    });

    expect(result.current.error).toBe("Error: already reverted");
  });

  it("shows a confirm dialog and retries with force when the task changed since the action", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    const actions = [
      {
        id: "log-1",
        tool_name: "archive_task",
        summary: 'Archived "T"',
        task_id: "task-1",
        revertible: true,
        reverted_at: null,
      },
    ];
    mockCommands({
      chat_with_ai: () => ({ reply: "Archived it.", actions }),
      revert_ai_action: (args) =>
        args?.force
          ? { status: "reverted", task: {} }
          : { status: "needs_confirmation" },
    });
    const onMutation = vi.fn();
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null, onMutation),
    );
    await act(async () => {
      await result.current.sendMessage("archive it");
    });
    onMutation.mockClear();

    let revertPromise!: Promise<void>;
    act(() => {
      revertPromise = result.current.revertAction("log-1");
    });
    await acceptConfirm(user);
    await act(async () => {
      await revertPromise;
    });

    expect(mockInvoke).toHaveBeenCalledWith("revert_ai_action", {
      id: "log-1",
      force: false,
    });
    expect(mockInvoke).toHaveBeenCalledWith("revert_ai_action", {
      id: "log-1",
      force: true,
    });
    expect(result.current.messages[1].actions?.[0].reverted_at).not.toBeNull();
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("does not revert when the confirmation is declined", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    const actions = [
      {
        id: "log-1",
        tool_name: "archive_task",
        summary: 'Archived "T"',
        task_id: "task-1",
        revertible: true,
        reverted_at: null,
      },
    ];
    mockCommands({
      chat_with_ai: () => ({ reply: "Archived it.", actions }),
      revert_ai_action: () => ({ status: "needs_confirmation" }),
    });
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", null, null),
    );
    await act(async () => {
      await result.current.sendMessage("archive it");
    });

    let revertPromise!: Promise<void>;
    act(() => {
      revertPromise = result.current.revertAction("log-1");
    });
    await declineConfirm(user);
    await act(async () => {
      await revertPromise;
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "revert_ai_action",
      expect.objectContaining({ force: true }),
    );
    expect(result.current.messages[1].actions?.[0].reverted_at).toBeNull();
  });
});
