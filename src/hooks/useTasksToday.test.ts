import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTasksToday } from "./useTasksToday";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

describe("useTasksToday", () => {
  it("fetches today's tasks on mount", async () => {
    const task = makeTask({ id: "t1" });
    mockCommands({ list_tasks_today: () => [task] });

    const { result } = renderHook(() => useTasksToday());

    await waitFor(() => expect(result.current.tasks).toEqual([task]));
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks_today");
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      list_tasks_today: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useTasksToday());

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
    expect(result.current.tasks).toEqual([]);
  });

  it("refresh re-fetches the task list on demand", async () => {
    let calls = 0;
    mockCommands({
      list_tasks_today: () => {
        calls += 1;
        return [makeTask({ id: `t${calls}` })];
      },
    });

    const { result } = renderHook(() => useTasksToday());
    await waitFor(() =>
      expect(result.current.tasks).toEqual([makeTask({ id: "t1" })]),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.tasks).toEqual([makeTask({ id: "t2" })]);
  });
});
