import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCloudSync } from "./useCloudSync";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

describe("useCloudSync", () => {
  it("loads providers and status on mount", async () => {
    mockCommands({
      list_cloud_providers: () => [{ id: "dropbox", display_name: "Dropbox" }],
      get_cloud_status: () => ({ status: "not_connected" }),
    });

    const { result } = renderHook(() => useCloudSync());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.providers).toEqual([{ id: "dropbox", display_name: "Dropbox" }]);
    expect(result.current.status).toEqual({ status: "not_connected" });
  });

  it("falls back to not_connected when loading fails", async () => {
    mockCommands({
      list_cloud_providers: () => {
        throw new Error("no Tauri runtime");
      },
    });

    const { result } = renderHook(() => useCloudSync());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual({ status: "not_connected" });
  });

  it("connect updates status on success", async () => {
    mockCommands({
      list_cloud_providers: () => [{ id: "dropbox", display_name: "Dropbox" }],
      get_cloud_status: () => ({ status: "not_connected" }),
      start_cloud_connect: (args) => ({
        status: "connected",
        provider: args?.providerId,
        account_label: "me@example.com",
        has_passphrase: false,
      }),
    });

    const { result } = renderHook(() => useCloudSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect("dropbox");
    });

    expect(result.current.status).toEqual({
      status: "connected",
      provider: "dropbox",
      account_label: "me@example.com",
      has_passphrase: false,
    });
    expect(mockInvoke).toHaveBeenCalledWith("start_cloud_connect", { providerId: "dropbox" });
  });

  it("connect surfaces a rejection via actionError without changing status", async () => {
    mockCommands({
      list_cloud_providers: () => [],
      get_cloud_status: () => ({ status: "not_connected" }),
      start_cloud_connect: () => {
        throw new Error("authorization denied: access_denied");
      },
    });

    const { result } = renderHook(() => useCloudSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.connect("dropbox")).rejects.toThrow("authorization denied");
    });

    expect(result.current.status).toEqual({ status: "not_connected" });
    expect(result.current.actionError).toContain("authorization denied");
  });

  it("disconnect updates status to not_connected", async () => {
    mockCommands({
      list_cloud_providers: () => [],
      get_cloud_status: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: null,
        has_passphrase: true,
      }),
      disconnect_cloud: () => ({ status: "not_connected" }),
    });

    const { result } = renderHook(() => useCloudSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.status).toEqual({ status: "not_connected" });
  });

  it("setPassphrase sends the passphrase and updates has_passphrase", async () => {
    mockCommands({
      list_cloud_providers: () => [],
      get_cloud_status: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: null,
        has_passphrase: false,
      }),
      set_cloud_passphrase: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: null,
        has_passphrase: true,
      }),
    });

    const { result } = renderHook(() => useCloudSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setPassphrase("hunter2");
    });

    expect(mockInvoke).toHaveBeenCalledWith("set_cloud_passphrase", { passphrase: "hunter2" });
    expect(result.current.status).toMatchObject({ has_passphrase: true });
  });

  it("push and pull take no arguments — the passphrase is cached server-side", async () => {
    mockCommands({
      list_cloud_providers: () => [],
      get_cloud_status: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: null,
        has_passphrase: true,
      }),
      push_to_cloud: () => undefined,
      pull_from_cloud: () => undefined,
    });

    const { result } = renderHook(() => useCloudSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.push();
    });
    expect(mockInvoke).toHaveBeenCalledWith("push_to_cloud");

    await act(async () => {
      await result.current.pull();
    });
    expect(mockInvoke).toHaveBeenCalledWith("pull_from_cloud");
  });

  it("push surfaces a rejection via actionError", async () => {
    mockCommands({
      list_cloud_providers: () => [],
      get_cloud_status: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: null,
        has_passphrase: true,
      }),
      push_to_cloud: () => {
        throw new Error("Dropbox upload failed: 401");
      },
    });

    const { result } = renderHook(() => useCloudSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.push()).rejects.toThrow("Dropbox upload failed");
    });

    expect(result.current.actionError).toContain("Dropbox upload failed");
  });
});
