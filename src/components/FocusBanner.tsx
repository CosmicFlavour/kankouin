import { useEffect, useState } from "react";
import { BellRingIcon, TargetIcon, XIcon } from "lucide-react";
import type { FocusSession } from "@/hooks/useFocusTask";
import { sendFocusReminderNotification } from "@/hooks/useFocusReminder";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FocusBannerProps {
  session: FocusSession | null;
  reminderMinutes: number;
  onClear: () => Promise<void>;
  onChangeReminderMinutes: (minutes: number | null) => Promise<void>;
}

// Purely passive: names the task the user said they'd be doing, and lets
// them tune or stop the reminder — it never restricts what else they do.
// Mounted app-wide (see App.tsx) so it's visible regardless of which view
// or project is currently open.
export function FocusBanner({
  session,
  reminderMinutes,
  onClear,
  onChangeReminderMinutes,
}: FocusBannerProps) {
  const [minutesDraft, setMinutesDraft] = useState(String(reminderMinutes));
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // The effective interval can change from outside (another instance of
  // useSettings, or the default resolving after this mounts) — keep the
  // draft in sync unless the user is actively editing it.
  useEffect(() => {
    setMinutesDraft(String(reminderMinutes));
  }, [reminderMinutes]);

  if (!session) return null;
  // Narrowed local: TS doesn't carry the `session` guard above into nested
  // function declarations for a parameter binding, only for `const`s.
  const focusedSession = session;

  async function saveMinutesIfChanged() {
    const parsed = Number(minutesDraft);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("Enter a whole number of minutes");
      return;
    }
    if (parsed === reminderMinutes) return;
    try {
      await onChangeReminderMinutes(parsed);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  // Fires the exact same notification the timer would, on demand — so the
  // user can see what it looks like (and confirm permission is granted)
  // without waiting out the interval.
  async function handleTestNotification() {
    setTesting(true);
    try {
      const sent = await sendFocusReminderNotification(focusedSession);
      toast(
        sent
          ? {
              title: "Test notification sent",
              description: "Check your system notifications.",
            }
          : {
              title: "Notification permission not granted",
              description:
                "Enable notifications for Kankouin in your OS settings.",
              variant: "destructive",
            },
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <TargetIcon className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">
        Focused on <span className="font-medium">{session.task.title}</span>
      </span>
      <label className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        Remind every
        <Input
          type="number"
          min={1}
          value={minutesDraft}
          onChange={(e) => setMinutesDraft(e.target.value)}
          onBlur={saveMinutesIfChanged}
          className="h-7 w-14 px-1.5 text-center"
        />
        min
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleTestNotification}
        disabled={testing}
        title="Send a test notification"
      >
        <BellRingIcon />
        <span className="sr-only">Send a test notification</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        title="Stop focusing"
      >
        <XIcon />
        <span className="sr-only">Stop focusing</span>
      </Button>
      {error && <span className="w-full text-destructive">{error}</span>}
    </div>
  );
}
