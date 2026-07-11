import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useStaleTasks } from "./useStaleTasks";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

describe("useStaleTasks", () => {
  it("fetches stale tasks on mount", async () => {
    const stale = makeTask({ id: "stale-1", state: "doing" });
    mockCommands({ get_stale_tasks: () => [stale] });

    const { result } = renderHook(() => useStaleTasks());

    await waitFor(() => expect(result.current.tasks).toEqual([stale]));
    expect(result.current.loading).toBe(false);
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      get_stale_tasks: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useStaleTasks());

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
  });

  it("refresh re-fetches and reflects newly resolved tasks", async () => {
    const stale = makeTask({ id: "stale-1" });
    mockCommands({ get_stale_tasks: () => [stale] });

    const { result } = renderHook(() => useStaleTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([stale]));

    mockCommands({ get_stale_tasks: () => [] });
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.tasks).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("get_stale_tasks");
  });
});
