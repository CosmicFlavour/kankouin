import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProjectDirectory } from "./useProjectDirectory";
import { mockCommands } from "@/test/tauriMock";

const workspaceA = {
  id: "ws-a",
  name: "Work",
  color: null,
  icon: null,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};
const workspaceB = {
  id: "ws-b",
  name: "Personal",
  color: null,
  icon: null,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};
const projectA = {
  id: "p-a",
  workspace_id: "ws-a",
  name: "Website relaunch",
  description: null,
  archived: false,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};
const projectB = {
  id: "p-b",
  workspace_id: "ws-b",
  name: "Home renovation",
  description: null,
  archived: false,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};

describe("useProjectDirectory", () => {
  it("resolves each project to its owning workspace name", async () => {
    mockCommands({
      list_workspaces: () => [workspaceA, workspaceB],
      list_projects: (args) =>
        args?.workspaceId === "ws-a" ? [projectA] : [projectB],
    });

    const { result } = renderHook(() => useProjectDirectory());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.directory.get("p-a")).toEqual({
      workspaceId: "ws-a",
      workspaceName: "Work",
      projectName: "Website relaunch",
    });
    expect(result.current.directory.get("p-b")).toEqual({
      workspaceId: "ws-b",
      workspaceName: "Personal",
      projectName: "Home renovation",
    });
  });

  it("surfaces an error without throwing when workspaces fail to load", async () => {
    mockCommands({
      list_workspaces: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useProjectDirectory());

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
    expect(result.current.directory.size).toBe(0);
  });
});
