import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useProjects } from "./useProjects";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const project = {
  id: "p1",
  workspace_id: "ws-1",
  name: "Website relaunch",
  description: null,
  archived: false,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};

describe("useProjects", () => {
  it("does nothing when workspaceId is null", () => {
    const { result } = renderHook(() => useProjects(null));
    expect(result.current.projects).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches projects for the given workspace", async () => {
    mockCommands({ list_projects: () => [project] });

    const { result } = renderHook(() => useProjects("ws-1"));

    await waitFor(() => expect(result.current.projects).toEqual([project]));
    expect(mockInvoke).toHaveBeenCalledWith("list_projects", {
      workspaceId: "ws-1",
    });
  });

  it("re-fetches when the workspaceId changes", async () => {
    const otherProject = { ...project, id: "p2", workspace_id: "ws-2" };
    mockCommands({
      list_projects: (args) =>
        args?.workspaceId === "ws-1" ? [project] : [otherProject],
    });

    const { result, rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string | null }) => useProjects(workspaceId),
      { initialProps: { workspaceId: "ws-1" } },
    );
    await waitFor(() => expect(result.current.projects).toEqual([project]));

    rerender({ workspaceId: "ws-2" });
    await waitFor(() => expect(result.current.projects).toEqual([otherProject]));
  });

  it("createProject is a no-op without a selected workspace, and appends when one is selected", async () => {
    mockCommands({
      list_projects: () => [],
      create_project: () => project,
    });

    const { result } = renderHook(() => useProjects("ws-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createProject("Website relaunch");
    });

    expect(result.current.projects).toEqual([project]);
    expect(mockInvoke).toHaveBeenCalledWith("create_project", {
      workspaceId: "ws-1",
      name: "Website relaunch",
      description: null,
    });
  });
});
