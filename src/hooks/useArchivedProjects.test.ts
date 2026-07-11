import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useArchivedProjects } from "./useArchivedProjects";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const archivedProject = {
  id: "p1",
  workspace_id: "ws-1",
  name: "Old website",
  description: null,
  archived: true,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};

describe("useArchivedProjects", () => {
  it("does nothing when workspaceId is null", () => {
    const { result } = renderHook(() => useArchivedProjects(null));
    expect(result.current.archivedProjects).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches archived projects for the given workspace", async () => {
    mockCommands({ list_archived_projects: () => [archivedProject] });

    const { result } = renderHook(() => useArchivedProjects("ws-1"));

    await waitFor(() =>
      expect(result.current.archivedProjects).toEqual([archivedProject]),
    );
    expect(mockInvoke).toHaveBeenCalledWith("list_archived_projects", {
      workspaceId: "ws-1",
    });
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      list_archived_projects: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useArchivedProjects("ws-1"));

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
  });

  it("re-fetches every time workspaceId transitions from null to a value", async () => {
    let calls = 0;
    mockCommands({
      list_archived_projects: () => {
        calls += 1;
        return [{ ...archivedProject, id: `p${calls}` }];
      },
    });

    const { result, rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string | null }) =>
        useArchivedProjects(workspaceId),
      { initialProps: { workspaceId: null as string | null } },
    );
    expect(result.current.archivedProjects).toEqual([]);

    rerender({ workspaceId: "ws-1" });
    await waitFor(() =>
      expect(result.current.archivedProjects).toEqual([
        { ...archivedProject, id: "p1" },
      ]),
    );

    // Collapsing (workspaceId -> null) clears the list rather than leaving
    // stale entries visible.
    rerender({ workspaceId: null });
    expect(result.current.archivedProjects).toEqual([]);

    // Reopening re-fetches instead of reusing the old response, so a
    // project archived elsewhere while this was collapsed shows up.
    rerender({ workspaceId: "ws-1" });
    await waitFor(() =>
      expect(result.current.archivedProjects).toEqual([
        { ...archivedProject, id: "p2" },
      ]),
    );
  });
});
