import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Task } from "@/hooks/useTasks";

export interface FocusSession {
  task: Task;
  started_at: string;
}

// The focus session is authoritative in the DB, and this hook may have
// several independent instances alive at once (e.g. the persistent banner
// in App.tsx and the toggle button in whichever task's detail view happens
// to be open) — there's no shared store between them. A short poll, rather
// than plumbing focus state through every intermediate component, keeps
// every instance eventually consistent with whichever one last changed it.
// Good enough for something this passive and low-stakes — same trade-off
// AiActionsPanel's docs make for not having a live-update mechanism.
const POLL_INTERVAL_MS = 5000;

export function useFocusTask() {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<FocusSession | null>("get_focus_task");
      setSession(result);
    } catch {
      // No Tauri runtime, or the query failed — treat as "nothing
      // focused" rather than leaving a stale value on screen.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function setFocus(taskId: string) {
    const result = await invoke<FocusSession>("set_focus_task", { taskId });
    setSession(result);
  }

  async function clearFocus() {
    await invoke("clear_focus_task");
    setSession(null);
  }

  return { session, loading, refresh, setFocus, clearFocus };
}
