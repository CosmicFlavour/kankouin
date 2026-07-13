import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDatabaseStatus } from "./useDatabaseStatus";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

describe("useDatabaseStatus", () => {
  it("loads the status on mount", async () => {
    mockCommands({
      get_database_status: () => ({ status: "ok", path: "/home/user/kankouin.sqlite3" }),
    });

    const { result } = renderHook(() => useDatabaseStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual({
      status: "ok",
      path: "/home/user/kankouin.sqlite3",
    });
  });

  it("falls back to not_configured when the status call fails", async () => {
    mockCommands({
      get_database_status: () => {
        throw new Error("no Tauri runtime");
      },
    });

    const { result } = renderHook(() => useDatabaseStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual({ status: "not_configured" });
  });

  it("createDatabaseFile updates status on success", async () => {
    mockCommands({
      get_database_status: () => ({ status: "not_configured" }),
      create_database_file: (args) => ({ status: "ok", path: args?.path }),
    });

    const { result } = renderHook(() => useDatabaseStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createDatabaseFile("/home/user/new.sqlite3");
    });

    expect(result.current.status).toEqual({
      status: "ok",
      path: "/home/user/new.sqlite3",
    });
    expect(mockInvoke).toHaveBeenCalledWith("create_database_file", {
      path: "/home/user/new.sqlite3",
    });
  });

  it("openDatabaseFile surfaces a rejection via actionError without changing status", async () => {
    mockCommands({
      get_database_status: () => ({ status: "not_configured" }),
      open_database_file: () => {
        throw new Error("no file found at /bad/path.sqlite3");
      },
    });

    const { result } = renderHook(() => useDatabaseStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.openDatabaseFile("/bad/path.sqlite3"),
      ).rejects.toThrow("no file found at /bad/path.sqlite3");
    });

    expect(result.current.status).toEqual({ status: "not_configured" });
    expect(result.current.actionError).toContain("no file found");
  });
});
