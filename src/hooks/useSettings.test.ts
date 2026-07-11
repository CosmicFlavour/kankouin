import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSettings } from "./useSettings";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

describe("useSettings", () => {
  it("loads settings on mount", async () => {
    mockCommands({
      get_settings: () => ({ last_sync_file_path: "/data/kankouin.enc", theme: "dark" }),
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() =>
      expect(result.current.settings.theme).toBe("dark"),
    );
    expect(result.current.settings.last_sync_file_path).toBe(
      "/data/kankouin.enc",
    );
  });

  it("keeps defaults instead of throwing when get_settings fails", async () => {
    mockCommands({
      get_settings: () => {
        throw new Error("no Tauri runtime");
      },
    });

    const { result } = renderHook(() => useSettings());

    // Give the rejected promise a tick to settle; defaults should remain.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.settings).toEqual({
      last_sync_file_path: null,
      theme: null,
    });
  });

  it("setTheme updates settings and applies the dark class", async () => {
    mockCommands({
      get_settings: () => ({ last_sync_file_path: null, theme: null }),
      set_theme: (args) => ({ last_sync_file_path: null, theme: args?.theme }),
    });

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings.theme).toBe(null));

    await act(async () => {
      await result.current.setTheme("dark");
    });

    expect(result.current.settings.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("set_theme", { theme: "dark" });
  });

  it("falls back to the OS dark-mode preference when no theme is stored", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    mockCommands({
      get_settings: () => ({ last_sync_file_path: null, theme: null }),
    });

    renderHook(() => useSettings());

    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
  });

  it("setLastSyncFilePath updates settings", async () => {
    mockCommands({
      get_settings: () => ({ last_sync_file_path: null, theme: null }),
      set_last_sync_file_path: (args) => ({
        last_sync_file_path: args?.path,
        theme: null,
      }),
    });

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings.theme).toBe(null));

    await act(async () => {
      await result.current.setLastSyncFilePath("/data/kankouin.enc");
    });

    expect(result.current.settings.last_sync_file_path).toBe(
      "/data/kankouin.enc",
    );
    expect(mockInvoke).toHaveBeenCalledWith("set_last_sync_file_path", {
      path: "/data/kankouin.enc",
    });
  });
});
