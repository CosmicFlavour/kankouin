import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIConnectionDialog } from "./AIConnectionDialog";

const connection = {
  provider: "openwebui",
  base_url: "https://openwebui.example.com",
  api_key: "sk-test",
  model: "sonnet-5",
};

function renderDialog(
  overrides: Partial<Parameters<typeof AIConnectionDialog>[0]> = {},
) {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClear = vi.fn().mockResolvedValue(undefined);

  render(
    <AIConnectionDialog
      trigger={<button type="button">AI connection settings</button>}
      connection={null}
      onSave={onSave}
      onClear={onClear}
      {...overrides}
    />,
  );
  return { user, onSave, onClear };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "AI connection settings" }),
  );
}

describe("AIConnectionDialog", () => {
  it("saves a new connection with the fixed openwebui provider", async () => {
    const { user, onSave } = renderDialog();
    await openDialog(user);

    await user.type(
      screen.getByPlaceholderText(/base url/i),
      "https://openwebui.example.com",
    );
    await user.type(screen.getByPlaceholderText("API key"), "sk-test");
    await user.type(screen.getByPlaceholderText(/model/i), "sonnet-5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      "openwebui",
      "https://openwebui.example.com",
      "sk-test",
      "sonnet-5",
    );
  });

  it("pre-fills the form from the existing connection when opened", async () => {
    const { user } = renderDialog({ connection });
    await openDialog(user);

    expect(screen.getByPlaceholderText(/base url/i)).toHaveValue(
      connection.base_url,
    );
    expect(screen.getByPlaceholderText("API key")).toHaveValue(
      connection.api_key,
    );
    expect(screen.getByPlaceholderText(/model/i)).toHaveValue(
      connection.model,
    );
  });

  it("does not show a clear button when there is no existing connection", async () => {
    const { user } = renderDialog({ connection: null });
    await openDialog(user);

    expect(
      screen.queryByRole("button", { name: "Clear connection" }),
    ).not.toBeInTheDocument();
  });

  it("clears an existing connection", async () => {
    const { user, onClear } = renderDialog({ connection });
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Clear connection" }));

    expect(onClear).toHaveBeenCalled();
  });

  it("shows an error when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("save failed"));
    const { user } = renderDialog({ onSave });
    await openDialog(user);

    await user.type(screen.getByPlaceholderText(/base url/i), "https://x.com");
    await user.type(screen.getByPlaceholderText(/model/i), "model");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Error: save failed")).toBeInTheDocument();
  });

  it("does not submit with a blank base URL or model", async () => {
    const { user, onSave } = renderDialog();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
  });
});
