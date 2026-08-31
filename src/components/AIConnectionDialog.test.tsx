import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIConnectionDialog } from "./AIConnectionDialog";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const connection = {
  provider: "openwebui",
  base_url: "https://openwebui.example.com",
  api_key: "sk-test",
  model: "sonnet-5",
  timeout_seconds: 90,
  ca_certificate_path: null,
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
  it("saves a new connection with the fixed openwebui provider and default timeout", async () => {
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
      120,
      null,
    );
  });

  it("saves with a custom timeout", async () => {
    const { user, onSave } = renderDialog();
    await openDialog(user);

    await user.type(screen.getByPlaceholderText(/base url/i), "https://x.com");
    await user.type(screen.getByPlaceholderText(/model/i), "model");
    const timeoutInput = screen.getByPlaceholderText(/timeout/i);
    await user.clear(timeoutInput);
    await user.type(timeoutInput, "45");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      "openwebui",
      "https://x.com",
      "",
      "model",
      45,
      null,
    );
  });

  it("does not submit with a zero or blank timeout", async () => {
    const { user, onSave } = renderDialog();
    await openDialog(user);

    await user.type(screen.getByPlaceholderText(/base url/i), "https://x.com");
    await user.type(screen.getByPlaceholderText(/model/i), "model");
    const timeoutInput = screen.getByPlaceholderText(/timeout/i);
    await user.clear(timeoutInput);
    await user.type(timeoutInput, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
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
    expect(screen.getByPlaceholderText(/timeout/i)).toHaveValue(
      connection.timeout_seconds,
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

  it("tests the connection and reports a matching model", async () => {
    mockCommands({
      test_ai_connection: () => ({
        model_found: true,
        available_models: ["sonnet-5", "llama3.1:70b"],
      }),
    });
    const { user } = renderDialog({ connection });
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await screen.findByText('Connected — model "sonnet-5" is available.'),
    ).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("test_ai_connection", {
      provider: "openwebui",
      baseUrl: connection.base_url,
      apiKey: connection.api_key,
      model: connection.model,
      timeoutSeconds: connection.timeout_seconds,
      caCertificatePath: null,
    });
  });

  it("tests the connection and reports a missing model", async () => {
    mockCommands({
      test_ai_connection: () => ({
        model_found: false,
        available_models: ["llama3.1:70b"],
      }),
    });
    const { user } = renderDialog({ connection });
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await screen.findByText(/wasn't found.*llama3\.1:70b/),
    ).toBeInTheDocument();
  });

  it("clears a stale test result once a field changes", async () => {
    mockCommands({
      test_ai_connection: () => ({ model_found: true, available_models: [] }),
    });
    const { user } = renderDialog({ connection });
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/is available/);

    await user.type(screen.getByPlaceholderText(/model/i), "-changed");

    expect(screen.queryByText(/is available/)).not.toBeInTheDocument();
  });

  it("shows an error when the connection test fails", async () => {
    mockCommands({
      test_ai_connection: () => {
        throw new Error("connection refused");
      },
    });
    const { user } = renderDialog({ connection });
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await screen.findByText("Error: connection refused"),
    ).toBeInTheDocument();
  });
});
