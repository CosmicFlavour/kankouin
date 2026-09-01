import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type { FocusSession } from "@/hooks/useFocusTask";

// Requests permission if it hasn't been granted yet, then sends the "stay
// focused" notification for `session`. Returns whether it was actually
// sent, so a caller (the reminder timer below, or a manual "test
// notification" button) can tell the user if it was blocked. Shared so the
// timer and the test button are guaranteed to produce the exact same
// notification, not two copies that can drift apart.
//
// The actual send goes through our own `send_desktop_notification` command
// rather than the plugin's `sendNotification()` — that call is broken on
// GNOME 46+ (Ubuntu 24.04+): the notification flashes and vanishes
// instantly. See `commands::notify::send_desktop_notification`'s doc
// comment on the backend for the root cause and the fix. Permission
// checking still goes through the plugin, since that part isn't affected
// (and is meaningful on platforms other than Linux, where it's always
// granted anyway).
export async function sendFocusReminderNotification(
  session: FocusSession,
): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  if (!granted) return false;
  await invoke("send_desktop_notification", {
    title: "Stay focused",
    body: `Still on: ${session.task.title}`,
  });
  return true;
}

// Drives the periodic "stay focused" desktop notification while a task is
// in focus. Purely passive: it only ever reminds the user of the task they
// set themselves, on a timer — it never looks at what else they do on the
// board (see the focus feature's design: self-directed, not a monitor).
export function useFocusReminder(
  session: FocusSession | null,
  reminderMinutes: number,
) {
  useEffect(() => {
    if (!session) return;
    // Only guards against the interval itself firing after unmount/session
    // change — a permission check already in flight at that point is
    // harmless to let finish (worst case, one extra correctly-worded
    // notification for the session that was just replaced).
    let cancelled = false;

    function fire() {
      if (cancelled) return;
      sendFocusReminderNotification(session!);
    }

    const id = setInterval(fire, reminderMinutes * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // `session.started_at` (not just its id) so re-focusing the same task
    // restarts the timer instead of silently keeping the old schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.task.id, session?.started_at, reminderMinutes]);
}
