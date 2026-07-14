import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatabasePanel } from "./DatabasePanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { mockInvoke, mockCommands, mockOpen, mockSave } from "@/test/tauriMock";
import { acceptConfirm, declineConfirm } from "@/test/confirmDialog";

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
      <DatabasePanel />
      <ConfirmDialog />
    </>,
  );
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_database_status"));
  return user;
}

describe("DatabasePanel", () => {
  it("renders nothing while there's no loaded database", () => {
    mockCommands({ get_database_status: () => ({ status: "not_configured" }) });

    const { container } = render(<DatabasePanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current database path once loaded", async () => {
    mockCommands({
      get_database_status: () => ({ status: "ok", path: "/home/user/kankouin.sqlite3" }),
    });

    await renderPanel();

    expect(await screen.findByText("/home/user/kankouin.sqlite3")).toBeInTheDocument();
  });

  it("does nothing when the create confirmation is declined", async () => {
    mockCommands({
      get_database_status: () => ({ status: "ok", path: "/home/user/kankouin.sqlite3" }),
    });
    mockSave.mockResolvedValue("/home/user/new.sqlite3");
    const user = await renderPanel();

    await user.click(screen.getByRole("button", { name: "Create a new database" }));
    await declineConfirm(user);

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "create_database_file",
      expect.anything(),
    );
  });

  it("switches to a newly created database and reloads once confirmed", async () => {
    mockCommands({
      get_database_status: () => ({ status: "ok", path: "/home/user/kankouin.sqlite3" }),
      create_database_file: (args) => ({ status: "ok", path: args?.path }),
    });
    mockSave.mockResolvedValue("/home/user/new.sqlite3");
    const reload = mockLocationReload();
    const user = await renderPanel();

    await user.click(screen.getByRole("button", { name: "Create a new database" }));
    await acceptConfirm(user);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_database_file", {
        path: "/home/user/new.sqlite3",
      }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("switches to a different opened database and reloads once confirmed", async () => {
    mockCommands({
      get_database_status: () => ({ status: "ok", path: "/home/user/kankouin.sqlite3" }),
      open_database_file: (args) => ({ status: "ok", path: args?.path }),
    });
    mockOpen.mockResolvedValue("/home/user/other.sqlite3");
    const reload = mockLocationReload();
    const user = await renderPanel();

    await user.click(screen.getByRole("button", { name: "Open a different database" }));
    await acceptConfirm(user);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("open_database_file", {
        path: "/home/user/other.sqlite3",
      }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("surfaces a failed switch without reloading", async () => {
    mockCommands({
      get_database_status: () => ({ status: "ok", path: "/home/user/kankouin.sqlite3" }),
      open_database_file: () => {
        throw new Error("not a database file");
      },
    });
    mockOpen.mockResolvedValue("/home/user/bad.sqlite3");
    const reload = mockLocationReload();
    const user = await renderPanel();

    await user.click(screen.getByRole("button", { name: "Open a different database" }));
    await acceptConfirm(user);

    expect(await screen.findByText("Error: not a database file")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
