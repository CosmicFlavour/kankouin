import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTaskDetail, type TaskDetail } from "./useTaskDetail";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

const detail: TaskDetail = {
  task: makeTask({ id: "t1" }),
  subtasks: [],
  tags: [],
  logs: [],
  blocked_by: [],
};

describe("useTaskDetail", () => {
  it("does nothing when taskId is null", () => {
    const { result } = renderHook(() => useTaskDetail(null));
    expect(result.current.detail).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches the task detail for the given id", async () => {
    mockCommands({ get_task: () => detail });

    const { result } = renderHook(() => useTaskDetail("t1"));

    await waitFor(() => expect(result.current.detail).toEqual(detail));
    expect(mockInvoke).toHaveBeenCalledWith("get_task", { id: "t1" });
  });

  it("addSubtask appends the new subtask to the existing detail", async () => {
    const newSubtask = {
      id: "st1",
      task_id: "t1",
      title: "Write draft",
      done: false,
      sort_order: 0,
      created_at: "2026-07-11T00:00:00Z",
    };
    mockCommands({
      get_task: () => detail,
      add_subtask: () => newSubtask,
    });

    const { result } = renderHook(() => useTaskDetail("t1"));
    await waitFor(() => expect(result.current.detail).toEqual(detail));

    await act(async () => {
      await result.current.addSubtask("Write draft");
    });

    expect(result.current.detail?.subtasks).toEqual([newSubtask]);
    expect(mockInvoke).toHaveBeenCalledWith("add_subtask", {
      taskId: "t1",
      title: "Write draft",
    });
  });

  it("toggleSubtask replaces only the matching subtask", async () => {
    const subtaskA = {
      id: "st1",
      task_id: "t1",
      title: "A",
      done: false,
      sort_order: 0,
      created_at: "2026-07-11T00:00:00Z",
    };
    const subtaskB = {
      id: "st2",
      task_id: "t1",
      title: "B",
      done: false,
      sort_order: 1,
      created_at: "2026-07-11T00:00:00Z",
    };
    mockCommands({
      get_task: () => ({ ...detail, subtasks: [subtaskA, subtaskB] }),
      toggle_subtask: () => ({ ...subtaskA, done: true }),
    });

    const { result } = renderHook(() => useTaskDetail("t1"));
    await waitFor(() =>
      expect(result.current.detail?.subtasks).toEqual([subtaskA, subtaskB]),
    );

    await act(async () => {
      await result.current.toggleSubtask("st1");
    });

    expect(result.current.detail?.subtasks).toEqual([
      { ...subtaskA, done: true },
      subtaskB,
    ]);
  });
});
