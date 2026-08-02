import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { mockCommands } from "@/test/tauriMock";
import { makeTask } from "@/test/factories";

const staleTask = makeTask({ id: "task-a", title: "Write draft" });

function mockBackend(overrides: Record<string, () => unknown> = {}) {
  mockCommands({
    get_database_status: () => ({ status: "ok" }),
    list_workspaces: () => [],
    get_stale_tasks: () => [staleTask],
    get_settings: () => ({ theme: "system", last_sync_file_path: null }),
    get_cloud_status: () => ({ connected: false }),
    list_cloud_providers: () => [],
    ...overrides,
  });
}

describe("App daily review auto-open", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("auto-opens Daily Review when there are stale tasks", async () => {
    mockBackend();
    render(<App />);

    expect(await screen.findByText("Write draft")).toBeInTheDocument();
  });

  it("does not auto-open again the same day after remounting", async () => {
    mockBackend();
    const { unmount } = render(<App />);
    await screen.findByText("Write draft");
    unmount();

    // Simulate closing and reopening the app: a fresh mount, same stale
    // tasks, same calendar day. Regression test for the bug where Daily
    // Review popped up on every app launch (see App.tsx).
    mockBackend();
    render(<App />);

    await screen.findByText("Select a workspace to get started");
    expect(screen.queryByText("Write draft")).not.toBeInTheDocument();
  });

  it("auto-opens again on a new calendar day", async () => {
    localStorage.setItem(
      "kankouin.dailyReview.lastAutoOpenedDate",
      "Wed Jul 01 2026",
    );
    mockBackend();
    render(<App />);

    expect(await screen.findByText("Write draft")).toBeInTheDocument();
  });
});
