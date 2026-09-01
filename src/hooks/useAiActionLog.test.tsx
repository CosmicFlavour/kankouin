import { describe, it, expect, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAiActionLog } from "./useAiActionLog";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { acceptConfirm, declineConfirm } from "@/test/confirmDialog";

const entry = {
  id: "log-1",
  tool_name: "archive_task",
  summary: 'Archived "Fix login bug"',
  task_id: "task-1",
  revertible: true,
  reverted_at: null,
  created_at: "2024-01-01T00:00:00Z",
};

describe("useAiActionLog", () => {
  it("refresh loads the log from the backend", async () => {
    mockCommands({ list_ai_actions: () => [entry] });
    const { result } = renderHook(() => useAiActionLog());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.actions).toEqual([entry]);
    expect(mockInvoke).toHaveBeenCalledWith("list_ai_actions");
  });

  it("surfaces an error without crashing when refresh fails", async () => {
    mockCommands({
      list_ai_actions: () => {
        throw new Error("db unavailable");
      },
    });
    const { result } = renderHook(() => useAiActionLog());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("Error: db unavailable");
    expect(result.current.actions).toEqual([]);
  });

  it("revert marks the matching action reverted and calls onMutation", async () => {
    mockCommands({
      list_ai_actions: () => [entry],
      revert_ai_action: () => ({ status: "reverted", task: {} }),
    });
    const onMutation = vi.fn();
    const { result } = renderHook(() => useAiActionLog(onMutation));

    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      await result.current.revert("log-1");
    });

    expect(mockInvoke).toHaveBeenCalledWith("revert_ai_action", {
      id: "log-1",
      force: false,
    });
    expect(result.current.actions[0].reverted_at).not.toBeNull();
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("revert surfaces an error without crashing", async () => {
    mockCommands({
      revert_ai_action: () => {
        throw new Error("already reverted");
      },
    });
    const { result } = renderHook(() => useAiActionLog());

    await act(async () => {
      await result.current.revert("log-1");
    });

    expect(result.current.error).toBe("Error: already reverted");
  });

  it("shows a confirm dialog and retries with force when the task changed since the action", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    mockCommands({
      list_ai_actions: () => [entry],
      revert_ai_action: (args) =>
        args?.force
          ? { status: "reverted", task: {} }
          : { status: "needs_confirmation" },
    });
    const onMutation = vi.fn();
    const { result } = renderHook(() => useAiActionLog(onMutation));
    await act(async () => {
      await result.current.refresh();
    });

    let revertPromise!: Promise<void>;
    act(() => {
      revertPromise = result.current.revert("log-1");
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
    expect(result.current.actions[0].reverted_at).not.toBeNull();
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("does not revert when the confirmation is declined", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    mockCommands({
      list_ai_actions: () => [entry],
      revert_ai_action: () => ({ status: "needs_confirmation" }),
    });
    const { result } = renderHook(() => useAiActionLog());
    await act(async () => {
      await result.current.refresh();
    });

    let revertPromise!: Promise<void>;
    act(() => {
      revertPromise = result.current.revert("log-1");
    });
    await declineConfirm(user);
    await act(async () => {
      await revertPromise;
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "revert_ai_action",
      expect.objectContaining({ force: true }),
    );
    expect(result.current.actions[0].reverted_at).toBeNull();
  });
});
