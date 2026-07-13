import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatabaseSetupScreen } from "./DatabaseSetupScreen";
import { mockOpen, mockSave } from "@/test/tauriMock";

// jsdom's window.location.reload isn't configurable enough for vi.spyOn;
// replacing the whole location object is the documented workaround (see
// DatabasePanel.test.tsx, which hits the same issue).
function mockLocationReload() {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  return reload;
}

describe("DatabaseSetupScreen", () => {
  it("shows welcome copy when not configured", () => {
    render(
      <DatabaseSetupScreen
        status={{ status: "not_configured" }}
        onCreateDatabaseFile={vi.fn()}
        onOpenDatabaseFile={vi.fn()}
      />,
    );

    expect(screen.getByText("Welcome to Kankouin")).toBeInTheDocument();
  });

  it("shows the missing-file path and reason when the configured file is gone", () => {
    render(
      <DatabaseSetupScreen
        status={{ status: "missing", path: "/home/user/kankouin.sqlite3" }}
        onCreateDatabaseFile={vi.fn()}
        onOpenDatabaseFile={vi.fn()}
      />,
    );

    expect(screen.getByText("Couldn't load your database")).toBeInTheDocument();
    expect(
      screen.getByText(/couldn't find a database file at \/home\/user\/kankouin.sqlite3/i),
    ).toBeInTheDocument();
  });

  it("creates a new database and reloads after picking a save path", async () => {
    const onCreateDatabaseFile = vi.fn().mockResolvedValue(undefined);
    mockSave.mockResolvedValue("/home/user/kankouin.sqlite3");
    const reload = mockLocationReload();
    const user = userEvent.setup();

    render(
      <DatabaseSetupScreen
        status={{ status: "not_configured" }}
        onCreateDatabaseFile={onCreateDatabaseFile}
        onOpenDatabaseFile={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create new database" }));

    await waitFor(() =>
      expect(onCreateDatabaseFile).toHaveBeenCalledWith("/home/user/kankouin.sqlite3"),
    );
    expect(reload).toHaveBeenCalled();
  });

  it("does nothing when the save dialog is cancelled", async () => {
    const onCreateDatabaseFile = vi.fn();
    mockSave.mockResolvedValue(null);
    const user = userEvent.setup();

    render(
      <DatabaseSetupScreen
        status={{ status: "not_configured" }}
        onCreateDatabaseFile={onCreateDatabaseFile}
        onOpenDatabaseFile={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create new database" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(onCreateDatabaseFile).not.toHaveBeenCalled();
  });

  it("opens an existing database and reloads after picking a file", async () => {
    const onOpenDatabaseFile = vi.fn().mockResolvedValue(undefined);
    mockOpen.mockResolvedValue("/home/user/old.sqlite3");
    const reload = mockLocationReload();
    const user = userEvent.setup();

    render(
      <DatabaseSetupScreen
        status={{ status: "not_configured" }}
        onCreateDatabaseFile={vi.fn()}
        onOpenDatabaseFile={onOpenDatabaseFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open existing database" }));

    await waitFor(() =>
      expect(onOpenDatabaseFile).toHaveBeenCalledWith("/home/user/old.sqlite3"),
    );
    expect(reload).toHaveBeenCalled();
  });

  it("surfaces a failed open without reloading", async () => {
    const onOpenDatabaseFile = vi.fn().mockRejectedValue(new Error("not a database file"));
    mockOpen.mockResolvedValue("/home/user/bad.sqlite3");
    const reload = mockLocationReload();
    const user = userEvent.setup();

    render(
      <DatabaseSetupScreen
        status={{ status: "not_configured" }}
        onCreateDatabaseFile={vi.fn()}
        onOpenDatabaseFile={onOpenDatabaseFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open existing database" }));

    expect(await screen.findByText("Error: not a database file")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
