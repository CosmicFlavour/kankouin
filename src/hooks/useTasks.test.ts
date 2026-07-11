import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTasks, type Task, type TaskSummary } from "./useTasks";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

describe("useTasks", () => {
  it("does nothing when projectId is null", () => {
    const { result } = renderHook(() => useTasks(null));
    expect(result.current.tasks).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches tasks for the given project on mount", async () => {
    const task = makeTask({ id: "t1" });
    mockCommands({ list_tasks: () => [task] });

    const { result } = renderHook(() => useTasks("project-1"));

    await waitFor(() => expect(result.current.tasks).toEqual([task]));
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", {
      projectId: "project-1",
    });
  });

  it("surfaces a fetch error instead of throwing", async () => {
    mockCommands({
      list_tasks: () => {
        throw new Error("db is locked");
      },
    });

    const { result } = renderHook(() => useTasks("project-1"));

    await waitFor(() => expect(result.current.error).toBe("Error: db is locked"));
    expect(result.current.tasks).toEqual([]);
  });

  it("ignores a late response for a project that is no longer selected", async () => {
    const taskA = makeTask({ id: "task-a" });
    const taskB = makeTask({ id: "task-b" });

    let resolveProjectA: (tasks: TaskSummary[]) => void = () => {};
    const pendingProjectA = new Promise<TaskSummary[]>((resolve) => {
      resolveProjectA = resolve;
    });

    mockCommands({
      list_tasks: (args) =>
        args?.projectId === "project-a" ? pendingProjectA : [taskB],
    });

    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | null }) => useTasks(projectId),
      { initialProps: { projectId: "project-a" } },
    );

    // Switch projects before project-a's request resolves — its effect
    // cleanup should mark that in-flight request as cancelled.
    rerender({ projectId: "project-b" });
    await waitFor(() => expect(result.current.tasks).toEqual([taskB]));

    await act(async () => {
      resolveProjectA([taskA]);
      // Flush the microtask queue so the (cancelled) .then() would run here
      // if the `cancelled` guard in useTasks.ts didn't suppress it.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.tasks).toEqual([taskB]);
  });

  it("createTask appends a new summary with empty tags and not blocked", async () => {
    const created: Task = {
      ...makeTask({ id: "new-task", title: "New task" }),
    };
    mockCommands({
      list_tasks: () => [],
      create_task: () => created,
    });

    const { result } = renderHook(() => useTasks("project-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createTask("New task");
    });

    expect(result.current.tasks).toEqual([
      { ...created, tags: [], blocked: false },
    ]);
    expect(mockInvoke).toHaveBeenCalledWith("create_task", {
      projectId: "project-1",
      title: "New task",
      description: null,
      epicId: null,
      userStoryId: null,
      priority: null,
    });
  });

  it("moveTask merges the updated state without dropping existing tags/blocked", async () => {
    const tag = { id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "red" };
    const existing = makeTask({ id: "t1", state: "todo", tags: [tag], blocked: true });
    mockCommands({
      list_tasks: () => [existing],
      update_task_state: () => ({ ...existing, state: "doing" } as Task),
    });

    const { result } = renderHook(() => useTasks("project-1"));
    await waitFor(() => expect(result.current.tasks).toEqual([existing]));

    await act(async () => {
      await result.current.moveTask("t1", "doing");
    });

    expect(result.current.tasks[0]).toMatchObject({
      state: "doing",
      tags: [tag],
      blocked: true,
    });
  });

  it("setDeadline sends exactDate for an exact deadline and fuzzyBucket for a fuzzy one", async () => {
    const task = makeTask({ id: "t1" });
    mockCommands({
      list_tasks: () => [task],
      set_deadline: (args) => ({ ...task, ...args } as unknown as Task),
    });

    const { result } = renderHook(() => useTasks("project-1"));
    await waitFor(() => expect(result.current.tasks).toEqual([task]));

    await act(async () => {
      await result.current.setDeadline("t1", "exact", "2026-08-01");
    });
    expect(mockInvoke).toHaveBeenCalledWith("set_deadline", {
      id: "t1",
      deadlineType: "exact",
      exactDate: "2026-08-01",
      fuzzyBucket: null,
    });

    await act(async () => {
      await result.current.setDeadline("t1", "fuzzy", "this_week");
    });
    expect(mockInvoke).toHaveBeenCalledWith("set_deadline", {
      id: "t1",
      deadlineType: "fuzzy",
      exactDate: null,
      fuzzyBucket: "this_week",
    });
  });

  it("setTaskTags filters the full tag list down to the selected ids", async () => {
    const task = makeTask({ id: "t1" });
    const allTags = [
      { id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "red" },
      { id: "tag-2", workspace_id: "ws-1", name: "later", color: "blue" },
    ];
    mockCommands({
      list_tasks: () => [task],
      set_task_tags: () => undefined,
    });

    const { result } = renderHook(() => useTasks("project-1"));
    await waitFor(() => expect(result.current.tasks).toEqual([task]));

    await act(async () => {
      await result.current.setTaskTags("t1", ["tag-2"], allTags);
    });

    expect(result.current.tasks[0].tags).toEqual([allTags[1]]);
  });

  it("setTaskParent merges the returned epic/story association", async () => {
    const task = makeTask({ id: "t1" });
    mockCommands({
      list_tasks: () => [task],
      set_task_parent: () => ({ ...task, epic_id: "epic-9", user_story_id: null } as Task),
    });

    const { result } = renderHook(() => useTasks("project-1"));
    await waitFor(() => expect(result.current.tasks).toEqual([task]));

    await act(async () => {
      await result.current.setTaskParent("t1", "epic-9", null);
    });

    expect(result.current.tasks[0].epic_id).toBe("epic-9");
  });

  it("archiveTask removes the task from local state", async () => {
    const task = makeTask({ id: "t1" });
    mockCommands({
      list_tasks: () => [task],
      archive_task: () => undefined,
    });

    const { result } = renderHook(() => useTasks("project-1"));
    await waitFor(() => expect(result.current.tasks).toEqual([task]));

    await act(async () => {
      await result.current.archiveTask("t1");
    });

    expect(result.current.tasks).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("archive_task", { id: "t1" });
  });

  it("deleteTask removes the task from local state", async () => {
    const task = makeTask({ id: "t1" });
    mockCommands({
      list_tasks: () => [task],
      delete_task: () => undefined,
    });

    const { result } = renderHook(() => useTasks("project-1"));
    await waitFor(() => expect(result.current.tasks).toEqual([task]));

    await act(async () => {
      await result.current.deleteTask("t1");
    });

    expect(result.current.tasks).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("delete_task", { id: "t1" });
  });
});
