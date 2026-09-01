import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { sendFocusReminderNotification, useFocusReminder } from "./useFocusReminder";
import type { FocusSession } from "./useFocusTask";
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

describe("sendFocusReminderNotification", () => {
  it("sends and returns true when permission is already granted", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.mocked(isPermissionGranted).mockResolvedValue(true);

    const sent = await sendFocusReminderNotification(session);

    expect(sent).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("send_desktop_notification", {
      title: "Stay focused",
      body: "Still on: Write the plan",
    });
  });

  it("requests permission when not yet granted, and sends if it's approved", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue("granted");

    const sent = await sendFocusReminderNotification(session);

    expect(sent).toBe(true);
    expect(requestPermission).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );
  });

  it("returns false and does not send when permission is refused", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue("denied");

    const sent = await sendFocusReminderNotification(session);

    expect(sent).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );
  });
});

describe("useFocusReminder", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when no task is focused", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.useFakeTimers();
    renderHook(() => useFocusReminder(null, 5));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );
  });

  it("fires a notification naming the focus task once the interval elapses", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.useFakeTimers();
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    renderHook(() => useFocusReminder(session, 5));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.objectContaining({ body: "Still on: Write the plan" }),
    );
  });

  it("does not fire before the configured interval elapses", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.useFakeTimers();
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    renderHook(() => useFocusReminder(session, 5));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 - 1000);
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );
  });

  it("does not fire when notification permission is denied", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.useFakeTimers();
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    renderHook(() => useFocusReminder(session, 5));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );
  });

  it("restarts the timer when the reminder interval changes", async () => {
    mockCommands({ send_desktop_notification: () => undefined });
    vi.useFakeTimers();
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    const { rerender } = renderHook(
      ({ minutes }) => useFocusReminder(session, minutes),
      { initialProps: { minutes: 5 } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000);
    });
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );

    // Interval changes to 1 minute — the old 5-minute countdown must not
    // carry over silently.
    rerender({ minutes: 1 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "send_desktop_notification",
      expect.anything(),
    );
    expect(
      mockInvoke.mock.calls.filter(
        ([cmd]) => cmd === "send_desktop_notification",
      ),
    ).toHaveLength(1);
  });
});
