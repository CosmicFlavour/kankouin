import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    list_tags: () => [],
    create_tag: () => {
      throw new Error("not mocked");
    },
    update_tag: () => {
      throw new Error("not mocked");
    },
    delete_tag: () => {
      throw new Error("not mocked");
    },
    list_all_tasks: () => [],
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

describe("App view navigation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("switching to the Tags nav entry shows TagsView and hides the workspace pane", async () => {
    mockBackend({ get_stale_tasks: () => [] });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Select a workspace to get started");
    await user.click(screen.getByRole("button", { name: "Tags" }));

    expect(await screen.findByRole("heading", { name: "Tags" })).toBeInTheDocument();
    expect(
      screen.queryByText("Select a workspace to get started"),
    ).not.toBeInTheDocument();
  });

  it("switching back to Today hides TagsView", async () => {
    mockBackend({ get_stale_tasks: () => [], list_tasks_today: () => [] });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Select a workspace to get started");
    await user.click(screen.getByRole("button", { name: "Tags" }));
    await screen.findByRole("heading", { name: "Tags" });

    await user.click(screen.getByRole("button", { name: "Today / This Week" }));

    await screen.findByRole("heading", { name: "Today / This Week" });
    expect(
      screen.queryByRole("heading", { name: "Tags" }),
    ).not.toBeInTheDocument();
  });

  it("switching to the Search nav entry shows SearchView and hides the workspace pane", async () => {
    mockBackend({ get_stale_tasks: () => [] });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Select a workspace to get started");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByRole("heading", { name: "Search" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Select a workspace to get started"),
    ).not.toBeInTheDocument();
  });
});

describe("App keyboard shortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("'o' switches to the Today view", async () => {
    mockBackend({ get_stale_tasks: () => [], list_tasks_today: () => [] });
    render(<App />);
    await screen.findByText("Select a workspace to get started");

    fireEvent.keyDown(window, { key: "o" });

    expect(
      await screen.findByRole("heading", { name: "Today / This Week" }),
    ).toBeInTheDocument();
  });

  it("'s' switches to the Search view", async () => {
    mockBackend({ get_stale_tasks: () => [] });
    render(<App />);
    await screen.findByText("Select a workspace to get started");

    fireEvent.keyDown(window, { key: "s" });

    expect(
      await screen.findByRole("heading", { name: "Search" }),
    ).toBeInTheDocument();
  });

  it("'/' switches to the Search view", async () => {
    mockBackend({ get_stale_tasks: () => [] });
    render(<App />);
    await screen.findByText("Select a workspace to get started");

    fireEvent.keyDown(window, { key: "/" });

    expect(
      await screen.findByRole("heading", { name: "Search" }),
    ).toBeInTheDocument();
  });

  it("F1 opens the shortcuts help dialog", async () => {
    mockBackend({ get_stale_tasks: () => [] });
    render(<App />);
    await screen.findByText("Select a workspace to get started");

    fireEvent.keyDown(window, { key: "F1" });

    expect(await screen.findByText("Keyboard shortcuts")).toBeInTheDocument();
    expect(
      screen.getByText("Go to Today / This Week view"),
    ).toBeInTheDocument();
  });

  it("ignores the 'o' shortcut while typing in a text field", async () => {
    mockBackend({ get_stale_tasks: () => [] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select a workspace to get started");

    await user.click(screen.getByRole("button", { name: "Search" }));
    const searchInput = await screen.findByPlaceholderText(
      "Search tasks by title...",
    );
    fireEvent.keyDown(searchInput, { key: "o" });

    expect(
      screen.queryByRole("heading", { name: "Today / This Week" }),
    ).not.toBeInTheDocument();
  });
});

describe("App AI assistant context scoping", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not send stale project/workspace context to the AI after navigating away from a project", async () => {
    const workspace = {
      id: "ws-1",
      name: "Personal",
      color: null,
      icon: null,
      created_at: "2026-07-11T00:00:00Z",
      updated_at: "2026-07-11T00:00:00Z",
    };
    const project = {
      id: "p1",
      workspace_id: "ws-1",
      name: "Website relaunch",
      description: null,
      archived: false,
      created_at: "2026-07-11T00:00:00Z",
      updated_at: "2026-07-11T00:00:00Z",
    };
    const chatWithAi = vi.fn(() => ({ reply: "Sure." }));
    mockBackend({
      get_stale_tasks: () => [],
      list_workspaces: () => [workspace],
      list_projects: () => [project],
      list_archived_projects: () => [],
      list_tasks: () => [],
      list_epics: () => [],
      list_user_stories: () => [],
      list_tasks_today: () => [],
      get_default_ai_system_prompt: () => "You are the default assistant.",
      chat_with_ai: chatWithAi,
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Select a workspace to get started");
    await user.click(screen.getByRole("button", { name: "Personal" }));
    await user.click(
      await screen.findByRole("button", { name: "Website relaunch" }),
    );

    // Navigate away without ever clearing the selection — this is the bug
    // being fixed: App.tsx must stop forwarding the stale selection once
    // the workspace view isn't what's actually showing (see the AI
    // assistant's props on <AIChatSidebar>).
    await user.click(
      screen.getByRole("button", { name: "Today / This Week" }),
    );
    await screen.findByRole("heading", { name: "Today / This Week" });

    await user.click(
      screen.getByRole("button", { name: "Toggle AI assistant" }),
    );
    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "what's due this week?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(chatWithAi).toHaveBeenCalled());
    expect(chatWithAi).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: null,
        workspaceId: null,
        projectName: null,
        workspaceName: null,
      }),
    );
  });
});
