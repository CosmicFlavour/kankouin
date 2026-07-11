import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncPanel } from "./SyncPanel";
import {
  mockInvoke,
  mockCommands,
  mockOpen,
  mockSave,
  mockConfirm,
} from "@/test/tauriMock";

// Every test starts from the same baseline: settings load with no prior
// sync file, and setLastSyncFilePath's own invoke call succeeds.
function mockBaselineSettings() {
  mockCommands({
    get_settings: () => ({ last_sync_file_path: null, theme: null }),
    set_last_sync_file_path: (args) => ({
      last_sync_file_path: args?.path,
      theme: null,
    }),
  });
}

// jsdom's window.location.reload isn't configurable enough for vi.spyOn;
// replacing the whole location object is the documented workaround.
function mockLocationReload() {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  return reload;
}

async function renderPanel() {
  const user = userEvent.setup();
  render(<SyncPanel />);
  // Let useSettings' get_settings effect resolve before interacting.
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_settings"));
  return user;
}

describe("SyncPanel export", () => {
  it("blocks export with no passphrase and never opens the save dialog", async () => {
    mockBaselineSettings();
    const user = await renderPanel();

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByText("Enter a passphrase first")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("does nothing when the save dialog is cancelled", async () => {
    mockBaselineSettings();
    mockSave.mockResolvedValue(null);
    const user = await renderPanel();

    await user.type(screen.getByPlaceholderText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "export_encrypted",
      expect.anything(),
    );
    expect(screen.queryByText("Exported")).not.toBeInTheDocument();
  });

  it("exports on success and remembers the chosen file path", async () => {
    mockCommands({
      get_settings: () => ({ last_sync_file_path: null, theme: null }),
      set_last_sync_file_path: (args) => ({
        last_sync_file_path: args?.path,
        theme: null,
      }),
      export_encrypted: () => undefined,
    });
    mockSave.mockResolvedValue("/home/user/Dropbox/kankouin.enc");
    const user = await renderPanel();

    await user.type(screen.getByPlaceholderText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByText("Exported")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("export_encrypted", {
      passphrase: "correct horse",
      filePath: "/home/user/Dropbox/kankouin.enc",
    });
    expect(mockInvoke).toHaveBeenCalledWith("set_last_sync_file_path", {
      path: "/home/user/Dropbox/kankouin.enc",
    });
  });

  it("surfaces a failed export without updating the remembered file path", async () => {
    mockCommands({
      get_settings: () => ({ last_sync_file_path: null, theme: null }),
      export_encrypted: () => {
        throw new Error("wrong passphrase");
      },
    });
    mockSave.mockResolvedValue("/home/user/Dropbox/kankouin.enc");
    const user = await renderPanel();

    await user.type(screen.getByPlaceholderText("Passphrase"), "wrong");
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByText("Error: wrong passphrase")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "set_last_sync_file_path",
      expect.anything(),
    );
  });
});

describe("SyncPanel import", () => {
  it("blocks import with no passphrase and never opens the file dialog", async () => {
    mockBaselineSettings();
    const user = await renderPanel();

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Enter a passphrase first")).toBeInTheDocument();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("does nothing when the file picker is cancelled", async () => {
    mockBaselineSettings();
    mockOpen.mockResolvedValue(null);
    const user = await renderPanel();

    await user.type(screen.getByPlaceholderText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("does nothing when the user declines the overwrite confirmation", async () => {
    mockBaselineSettings();
    mockOpen.mockResolvedValue("/home/user/Dropbox/kankouin.enc");
    mockConfirm.mockResolvedValue(false);
    const user = await renderPanel();

    await user.type(screen.getByPlaceholderText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "import_encrypted",
      expect.anything(),
    );
  });

  it("imports and reloads after the user confirms the overwrite", async () => {
    mockCommands({
      get_settings: () => ({ last_sync_file_path: null, theme: null }),
      set_last_sync_file_path: (args) => ({
        last_sync_file_path: args?.path,
        theme: null,
      }),
      import_encrypted: () => undefined,
    });
    mockOpen.mockResolvedValue("/home/user/Dropbox/kankouin.enc");
    mockConfirm.mockResolvedValue(true);
    const reload = mockLocationReload();
    const user = await renderPanel();

    await user.type(screen.getByPlaceholderText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Imported — reloading...")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("import_encrypted", {
      passphrase: "correct horse",
      filePath: "/home/user/Dropbox/kankouin.enc",
    });
    expect(reload).toHaveBeenCalled();
  });

  it("surfaces a failed import without reloading", async () => {
    mockCommands({
      get_settings: () => ({ last_sync_file_path: null, theme: null }),
      import_encrypted: () => {
        throw new Error("corrupted file");
      },
    });
    mockOpen.mockResolvedValue("/home/user/Dropbox/kankouin.enc");
    mockConfirm.mockResolvedValue(true);
    const reload = mockLocationReload();
    const user = await renderPanel();

    await user.type(screen.getByPlaceholderText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Error: corrupted file")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
