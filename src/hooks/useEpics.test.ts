import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEpics } from "./useEpics";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeEpic } from "@/test/factories";

describe("useEpics", () => {
  it("does nothing when projectId is null", () => {
    const { result } = renderHook(() => useEpics(null));
    expect(result.current.epics).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches epics for the given project", async () => {
    const epic = makeEpic({ id: "epic-1" });
    mockCommands({ list_epics: () => [epic] });

    const { result } = renderHook(() => useEpics("project-1"));

    await waitFor(() => expect(result.current.epics).toEqual([epic]));
    expect(mockInvoke).toHaveBeenCalledWith("list_epics", {
      projectId: "project-1",
    });
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      list_epics: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useEpics("project-1"));

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
  });

  it("createEpic appends the created epic and returns it", async () => {
    const epic = makeEpic({ id: "epic-1", title: "Launch" });
    mockCommands({
      list_epics: () => [],
      create_epic: () => epic,
    });

    const { result } = renderHook(() => useEpics("project-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createEpic("Launch");
    });

    expect(created).toEqual(epic);
    expect(result.current.epics).toEqual([epic]);
    expect(mockInvoke).toHaveBeenCalledWith("create_epic", {
      projectId: "project-1",
      title: "Launch",
      description: null,
    });
  });

  it("deleteEpic removes the epic from local state", async () => {
    const epic = makeEpic({ id: "epic-1" });
    mockCommands({
      list_epics: () => [epic],
      delete_epic: () => undefined,
    });

    const { result } = renderHook(() => useEpics("project-1"));
    await waitFor(() => expect(result.current.epics).toEqual([epic]));

    await act(async () => {
      await result.current.deleteEpic("epic-1");
    });

    expect(result.current.epics).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("delete_epic", { id: "epic-1" });
  });

  it("does not remove the epic locally when deletion fails", async () => {
    const epic = makeEpic({ id: "epic-1" });
    mockCommands({
      list_epics: () => [epic],
      delete_epic: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useEpics("project-1"));
    await waitFor(() => expect(result.current.epics).toEqual([epic]));

    await expect(
      act(async () => {
        await result.current.deleteEpic("epic-1");
      }),
    ).rejects.toThrow("boom");

    expect(result.current.epics).toEqual([epic]);
  });
});
