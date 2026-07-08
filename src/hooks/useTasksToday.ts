import { useEffect, useState } from "react";
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

  return { tasks, loading, error };
}
