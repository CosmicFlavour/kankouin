import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAIChat } from "./useAIChat";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

describe("useAIChat", () => {
  it("sends the message with project/workspace context and appends the reply", async () => {
    mockCommands({ chat_with_ai: () => "Sure, I can help with that." });

    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1"),
    );

    await act(async () => {
      await result.current.sendMessage("Break this task down");
    });

    expect(mockInvoke).toHaveBeenCalledWith("chat_with_ai", {
      message: "Break this task down",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Break this task down" }),
      expect.objectContaining({
        role: "assistant",
        content: "Sure, I can help with that.",
      }),
    ]);
    expect(result.current.error).toBeNull();
  });

  it("ignores a blank message", async () => {
    mockCommands({ chat_with_ai: () => "unused" });
    const { result } = renderHook(() => useAIChat(null, null));

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it("surfaces a failure without appending an assistant message, and skips onMutation", async () => {
    mockCommands({
      chat_with_ai: () => {
        throw new Error("ai backend unavailable");
      },
    });
    const onMutation = vi.fn();
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", onMutation),
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
    expect(onMutation).not.toHaveBeenCalled();
  });

  it("calls onMutation exactly once after a successful reply", async () => {
    mockCommands({ chat_with_ai: () => "done" });
    const onMutation = vi.fn();
    const { result } = renderHook(() =>
      useAIChat("project-1", "workspace-1", onMutation),
    );

    await act(async () => {
      await result.current.sendMessage("add a subtask");
    });

    expect(onMutation).toHaveBeenCalledTimes(1);
  });
});
