import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useWorkspaces } from "./useWorkspaces";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const workspace = {
  id: "ws-1",
  name: "Personal",
  color: null,
  icon: null,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};

describe("useWorkspaces", () => {
  it("fetches workspaces on mount", async () => {
    mockCommands({ list_workspaces: () => [workspace] });

    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => expect(result.current.workspaces).toEqual([workspace]));
    expect(result.current.loading).toBe(false);
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      list_workspaces: () => {
        throw new Error("no db");
      },
    });

    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => expect(result.current.error).toBe("Error: no db"));
  });

  it("createWorkspace appends the created workspace", async () => {
    mockCommands({
      list_workspaces: () => [],
      create_workspace: () => workspace,
    });

    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createWorkspace("Personal");
    });

    expect(result.current.workspaces).toEqual([workspace]);
    expect(mockInvoke).toHaveBeenCalledWith("create_workspace", {
      name: "Personal",
      color: null,
      icon: null,
    });
  });

  it("deleteWorkspace removes the workspace from local state", async () => {
    mockCommands({
      list_workspaces: () => [workspace],
      delete_workspace: () => undefined,
    });

    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => expect(result.current.workspaces).toEqual([workspace]));

    await act(async () => {
      await result.current.deleteWorkspace("ws-1");
    });

    expect(result.current.workspaces).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("delete_workspace", { id: "ws-1" });
  });
});
