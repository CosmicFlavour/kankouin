import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFocusTask } from "./useFocusTask";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const task = {
  id: "task-1",
  project_id: "project-1",
  epic_id: null,
  user_story_id: null,
  title: "Write the plan",
  description: null,
  state: "doing",
  priority: "high",
  deadline_type: null,
  exact_date: null,
  fuzzy_bucket: null,
  bucket_period: null,
  state_since: "2026-01-01T00:00:00Z",
  archived: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("useFocusTask", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the current focus session on mount", async () => {
    mockCommands({
      get_focus_task: () => ({ task, started_at: "2026-01-01T00:00:00Z" }),
    });

    const { result } = renderHook(() => useFocusTask());

    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(result.current.session?.task.title).toBe("Write the plan");
    expect(result.current.loading).toBe(false);
  });

  it("reports no session when nothing is focused", async () => {
    mockCommands({ get_focus_task: () => null });

    const { result } = renderHook(() => useFocusTask());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it("treats a failed fetch as no session rather than staying stuck loading", async () => {
    mockCommands({
      get_focus_task: () => {
        throw new Error("no Tauri runtime");
      },
    });

    const { result } = renderHook(() => useFocusTask());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it("setFocus updates the session and calls set_focus_task with the task id", async () => {
    mockCommands({
      get_focus_task: () => null,
      set_focus_task: () => ({ task, started_at: "2026-01-01T00:00:00Z" }),
    });

    const { result } = renderHook(() => useFocusTask());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setFocus("task-1");
    });

    expect(result.current.session?.task.id).toBe("task-1");
    expect(mockInvoke).toHaveBeenCalledWith("set_focus_task", {
      taskId: "task-1",
    });
  });

  it("clearFocus clears the session", async () => {
    mockCommands({
      get_focus_task: () => ({ task, started_at: "2026-01-01T00:00:00Z" }),
      clear_focus_task: () => undefined,
    });

    const { result } = renderHook(() => useFocusTask());
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await result.current.clearFocus();
    });

    expect(result.current.session).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("clear_focus_task");
  });

  it("polls for changes made by another instance", async () => {
    vi.useFakeTimers();
    let focused = false;
    mockCommands({
      get_focus_task: () =>
        focused ? { task, started_at: "2026-01-01T00:00:00Z" } : null,
    });

    const { result } = renderHook(() => useFocusTask());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();

    // Simulates a *different* useFocusTask instance (e.g. a task detail
    // panel) setting focus — this instance only finds out via its poll.
    focused = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.session?.task.id).toBe("task-1");
  });
});
