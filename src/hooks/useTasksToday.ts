import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TaskSummary } from "@/hooks/useTasks";

export function useTasksToday() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<TaskSummary[]>("list_tasks_today")
      .then((result) => {
        if (!cancelled) setTasks(result);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Exposed so a task edited via a dialog fed by a different hook instance
  // (see TaskDetailDialog) can be re-checked against list_today's criteria
  // once that dialog closes — e.g. marking a task done or pushing its
  // deadline out should drop it from this list.
  const refresh = useCallback(async () => {
    const result = await invoke<TaskSummary[]>("list_tasks_today");
    setTasks(result);
    return result;
  }, []);

  return { tasks, loading, error, refresh };
}
