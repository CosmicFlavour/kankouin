import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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
});
