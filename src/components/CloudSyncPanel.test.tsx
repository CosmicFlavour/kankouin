import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudSyncPanel } from "./CloudSyncPanel";
import { Toaster } from "./Toaster";
import { mockInvoke, mockCommands, mockConfirm } from "@/test/tauriMock";

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
  render(
    <>
      <CloudSyncPanel />
      <Toaster />
    </>,
  );
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_cloud_status"));
  return user;
}

describe("CloudSyncPanel — not connected", () => {
  it("renders a connect button per available provider", async () => {
    mockCommands({
      list_cloud_providers: () => [{ id: "dropbox", display_name: "Dropbox" }],
      get_cloud_status: () => ({ status: "not_connected" }),
    });

    await renderPanel();

    expect(await screen.findByRole("button", { name: "Connect Dropbox" })).toBeInTheDocument();
  });

  it("connects on click", async () => {
    mockCommands({
      list_cloud_providers: () => [{ id: "dropbox", display_name: "Dropbox" }],
      get_cloud_status: () => ({ status: "not_connected" }),
      start_cloud_connect: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: "me@example.com",
        has_passphrase: false,
      }),
    });
    const user = await renderPanel();

    await user.click(await screen.findByRole("button", { name: "Connect Dropbox" }));

    expect(mockInvoke).toHaveBeenCalledWith("start_cloud_connect", { providerId: "dropbox" });
    expect(await screen.findByText("me@example.com")).toBeInTheDocument();
  });
});

describe("CloudSyncPanel — connected without a passphrase", () => {
  function mockConnectedNoPassphrase() {
    mockCommands({
      list_cloud_providers: () => [],
      get_cloud_status: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: "me@example.com",
        has_passphrase: false,
      }),
      set_cloud_passphrase: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: "me@example.com",
        has_passphrase: true,
      }),
    });
  }

  it("shows a passphrase field instead of push/pull", async () => {
    mockConnectedNoPassphrase();
    await renderPanel();

    expect(await screen.findByPlaceholderText("Encryption passphrase")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Push" })).not.toBeInTheDocument();
  });

  it("saving a passphrase switches to the push/pull view", async () => {
    mockConnectedNoPassphrase();
    const user = await renderPanel();

    await user.type(await screen.findByPlaceholderText("Encryption passphrase"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockInvoke).toHaveBeenCalledWith("set_cloud_passphrase", { passphrase: "hunter2" });
    expect(await screen.findByRole("button", { name: "Push" })).toBeInTheDocument();
  });
});

describe("CloudSyncPanel — connected with a passphrase", () => {
  function mockConnectedWithPassphrase(overrides: Record<string, unknown> = {}) {
    mockCommands({
      list_cloud_providers: () => [],
      get_cloud_status: () => ({
        status: "connected",
        provider: "dropbox",
        account_label: "me@example.com",
        has_passphrase: true,
      }),
      ...overrides,
    });
  }

  it("pushes on click and shows a confirmation message", async () => {
    mockConnectedWithPassphrase({ push_to_cloud: () => undefined });
    const user = await renderPanel();

    await user.click(await screen.findByRole("button", { name: "Push" }));

    expect(mockInvoke).toHaveBeenCalledWith("push_to_cloud");
    expect(await screen.findByText("Synced to cloud")).toBeInTheDocument();
  });

  it("does nothing on pull when the overwrite confirmation is declined", async () => {
    mockConnectedWithPassphrase();
    mockConfirm.mockResolvedValue(false);
    const user = await renderPanel();

    await user.click(await screen.findByRole("button", { name: "Pull" }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalledWith("pull_from_cloud");
  });

  it("pulls and reloads once the overwrite is confirmed", async () => {
    mockConnectedWithPassphrase({ pull_from_cloud: () => undefined });
    mockConfirm.mockResolvedValue(true);
    const reload = mockLocationReload();
    const user = await renderPanel();

    await user.click(await screen.findByRole("button", { name: "Pull" }));

    expect(await screen.findByText("Synced from cloud")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("pull_from_cloud");
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("surfaces a failed push without showing a success message", async () => {
    mockConnectedWithPassphrase({
      push_to_cloud: () => {
        throw new Error("Dropbox upload failed: 401");
      },
    });
    const user = await renderPanel();

    await user.click(await screen.findByRole("button", { name: "Push" }));

    expect(await screen.findByText("Error: Dropbox upload failed: 401")).toBeInTheDocument();
    expect(screen.queryByText("Synced to cloud")).not.toBeInTheDocument();
  });

  it("'Change passphrase' reveals the passphrase field again", async () => {
    mockConnectedWithPassphrase();
    const user = await renderPanel();

    await user.click(await screen.findByRole("button", { name: "Change passphrase" }));

    expect(await screen.findByPlaceholderText("Encryption passphrase")).toBeInTheDocument();
  });

  it("disconnects on click", async () => {
    mockConnectedWithPassphrase({ disconnect_cloud: () => ({ status: "not_connected" }) });
    const user = await renderPanel();

    await user.click(await screen.findByRole("button", { name: "Disconnect" }));

    expect(mockInvoke).toHaveBeenCalledWith("disconnect_cloud");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Push" })).not.toBeInTheDocument(),
    );
  });
});
