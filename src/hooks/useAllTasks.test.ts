import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAllTasks } from "./useAllTasks";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

describe("useAllTasks", () => {
  it("fetches every active task on mount", async () => {
    const task = makeTask({ id: "t1" });
    mockCommands({ list_all_tasks: () => [task] });

    const { result } = renderHook(() => useAllTasks());

    await waitFor(() => expect(result.current.tasks).toEqual([task]));
    expect(mockInvoke).toHaveBeenCalledWith("list_all_tasks");
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      list_all_tasks: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useAllTasks());

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
    expect(result.current.tasks).toEqual([]);
  });

  it("refresh re-fetches the task list on demand", async () => {
    let calls = 0;
    mockCommands({
      list_all_tasks: () => {
        calls += 1;
        return [makeTask({ id: `t${calls}` })];
      },
    });

    const { result } = renderHook(() => useAllTasks());
    await waitFor(() =>
      expect(result.current.tasks).toEqual([makeTask({ id: "t1" })]),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.tasks).toEqual([makeTask({ id: "t2" })]);
  });
});
