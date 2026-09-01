import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isPermissionGranted } from "@tauri-apps/plugin-notification";
import { FocusBanner } from "./FocusBanner";
import { Toaster } from "@/components/Toaster";
import type { FocusSession } from "@/hooks/useFocusTask";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const session: FocusSession = {
  task: {
    id: "task-1",
    project_id: "project-1",
    epic_id: null,
    user_story_id: null,
    title: "Write the plan",
    description: null,
    state: "doing",
    priority: "high",
    deadline_type: null,
    exact_date: null,
    fuzzy_bucket: null,
    bucket_period: null,
    state_since: "2026-01-01T00:00:00Z",
    archived: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  started_at: "2026-01-01T00:00:00Z",
};

describe("FocusBanner", () => {
  it("renders nothing when no task is focused", () => {
    const { container } = render(
      <FocusBanner
        session={null}
        reminderMinutes={5}
        onClear={vi.fn()}
        onChangeReminderMinutes={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names the focused task and the reminder interval", () => {
    render(
      <FocusBanner
        session={session}
        reminderMinutes={5}
        onClear={vi.fn()}
        onChangeReminderMinutes={vi.fn()}
      />,
    );

    expect(screen.getByText("Write the plan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
  });

  it("calls onClear when Stop focusing is clicked", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(
      <FocusBanner
        session={session}
        reminderMinutes={5}
        onClear={onClear}
        onChangeReminderMinutes={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Stop focusing" }));

    expect(onClear).toHaveBeenCalled();
  });

  it("saves a changed reminder interval on blur", async () => {
    const user = userEvent.setup();
    const onChangeReminderMinutes = vi.fn().mockResolvedValue(undefined);
    render(
      <FocusBanner
        session={session}
        reminderMinutes={5}
        onClear={vi.fn()}
        onChangeReminderMinutes={onChangeReminderMinutes}
      />,
    );

    const input = screen.getByDisplayValue("5");
    await user.clear(input);
    await user.type(input, "15");
    await user.tab();

    expect(onChangeReminderMinutes).toHaveBeenCalledWith(15);
  });

  it("does not call onChangeReminderMinutes when the value is unchanged", async () => {
    const user = userEvent.setup();
    const onChangeReminderMinutes = vi.fn();
    render(
      <FocusBanner
        session={session}
        reminderMinutes={5}
        onClear={vi.fn()}
        onChangeReminderMinutes={onChangeReminderMinutes}
      />,
    );

    await user.click(screen.getByDisplayValue("5"));
    await user.tab();

    expect(onChangeReminderMinutes).not.toHaveBeenCalled();
  });

  it("rejects a non-positive interval without calling the backend", async () => {
    const user = userEvent.setup();
    const onChangeReminderMinutes = vi.fn();
    render(
      <FocusBanner
        session={session}
        reminderMinutes={5}
        onClear={vi.fn()}
        onChangeReminderMinutes={onChangeReminderMinutes}
      />,
    );

    const input = screen.getByDisplayValue("5");
    await user.clear(input);
    await user.type(input, "0");
    await user.tab();

    expect(onChangeReminderMinutes).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a whole number of minutes"),
    ).toBeInTheDocument();
  });

  it("shows an error if saving the interval fails", async () => {
    const user = userEvent.setup();
    const onChangeReminderMinutes = vi
      .fn()
      .mockRejectedValue(new Error("invalid input"));
    render(
      <FocusBanner
        session={session}
        reminderMinutes={5}
        onClear={vi.fn()}
        onChangeReminderMinutes={onChangeReminderMinutes}
      />,
    );

    const input = screen.getByDisplayValue("5");
    await user.clear(input);
    await user.type(input, "20");
    await user.tab();

    expect(await screen.findByText("Error: invalid input")).toBeInTheDocument();
  });

  it("sends a test notification and confirms it when permission is granted", async () => {
    const user = userEvent.setup();
    mockCommands({ send_desktop_notification: () => undefined });
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    render(
      <>
        <FocusBanner
          session={session}
          reminderMinutes={5}
          onClear={vi.fn()}
          onChangeReminderMinutes={vi.fn()}
        />
        <Toaster />
      </>,
    );

    await user.click(
      screen.getByRole("button", { name: "Send a test notification" }),
    );

    expect(mockInvoke).toHaveBeenCalledWith("send_desktop_notification", {
      title: "Stay focused",
      body: "Still on: Write the plan",
    });
    expect(
      await screen.findByText("Test notification sent"),
    ).toBeInTheDocument();
  });

  it("tells the user when notification permission isn't granted", async () => {
    const user = userEvent.setup();
    mockCommands({ send_desktop_notification: () => undefined });
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    render(
      <>
        <FocusBanner
          session={session}
          reminderMinutes={5}
          onClear={vi.fn()}
          onChangeReminderMinutes={vi.fn()}
        />
        <Toaster />
      </>,
    );

    await user.click(
      screen.getByRole("button", { name: "Send a test notification" }),
    );

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );
    expect(
      await screen.findByText("Notification permission not granted"),
    ).toBeInTheDocument();
  });
});
