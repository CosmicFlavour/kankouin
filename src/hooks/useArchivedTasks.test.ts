import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useArchivedTasks } from "./useArchivedTasks";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

describe("useArchivedTasks", () => {
  it("does nothing when projectId is null", () => {
    const { result } = renderHook(() => useArchivedTasks(null));
    expect(result.current.archivedTasks).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches archived tasks for the given project", async () => {
    const task = makeTask({ id: "t1", archived: true });
    mockCommands({ list_archived_tasks: () => [task] });

    const { result } = renderHook(() => useArchivedTasks("project-1"));

    await waitFor(() => expect(result.current.archivedTasks).toEqual([task]));
    expect(mockInvoke).toHaveBeenCalledWith("list_archived_tasks", {
      projectId: "project-1",
    });
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      list_archived_tasks: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useArchivedTasks("project-1"));

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
  });

  it("re-fetches every time projectId transitions from null to a value", async () => {
    let calls = 0;
    mockCommands({
      list_archived_tasks: () => {
        calls += 1;
        return [makeTask({ id: `t${calls}`, archived: true })];
      },
    });

    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | null }) =>
        useArchivedTasks(projectId),
      { initialProps: { projectId: null as string | null } },
    );
    expect(result.current.archivedTasks).toEqual([]);

    rerender({ projectId: "project-1" });
    await waitFor(() =>
      expect(result.current.archivedTasks).toEqual([
        makeTask({ id: "t1", archived: true }),
      ]),
    );

    // Collapsing (projectId -> null, e.g. "Show hidden" toggled off) clears
    // the list rather than leaving stale entries visible.
    rerender({ projectId: null });
    expect(result.current.archivedTasks).toEqual([]);

    rerender({ projectId: "project-1" });
    await waitFor(() =>
      expect(result.current.archivedTasks).toEqual([
        makeTask({ id: "t2", archived: true }),
      ]),
    );
  });

  it("unarchiveTask calls the command and removes the task from local state", async () => {
    const task = makeTask({ id: "t1", archived: true });
    mockCommands({
      list_archived_tasks: () => [task],
      unarchive_task: () => ({ ...task, archived: false }),
    });

    const { result } = renderHook(() => useArchivedTasks("project-1"));
    await waitFor(() => expect(result.current.archivedTasks).toEqual([task]));

    await act(async () => {
      await result.current.unarchiveTask("t1");
    });

    expect(result.current.archivedTasks).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("unarchive_task", { id: "t1" });
  });

  it("does not remove the task locally when unarchiving fails", async () => {
    const task = makeTask({ id: "t1", archived: true });
    mockCommands({
      list_archived_tasks: () => [task],
      unarchive_task: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useArchivedTasks("project-1"));
    await waitFor(() => expect(result.current.archivedTasks).toEqual([task]));

    await expect(
      act(async () => {
        await result.current.unarchiveTask("t1");
      }),
    ).rejects.toThrow("boom");

    expect(result.current.archivedTasks).toEqual([task]);
  });

  it("refresh re-fetches the archived list on demand", async () => {
    let calls = 0;
    mockCommands({
      list_archived_tasks: () => {
        calls += 1;
        return [makeTask({ id: `t${calls}`, archived: true })];
      },
    });

    const { result } = renderHook(() => useArchivedTasks("project-1"));
    await waitFor(() =>
      expect(result.current.archivedTasks).toEqual([
        makeTask({ id: "t1", archived: true }),
      ]),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.archivedTasks).toEqual([
      makeTask({ id: "t2", archived: true }),
    ]);
  });
});
