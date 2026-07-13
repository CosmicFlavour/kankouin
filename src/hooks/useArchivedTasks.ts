import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TaskSummary } from "@/hooks/useTasks";

// Read-only-ish and fetched lazily, same shape as useArchivedProjects: pass
// `null` (e.g. while "Show hidden" is off) to skip fetching, and the real
// projectId once the caller wants the list.
export function useArchivedTasks(projectId: string | null) {
  const [archivedTasks, setArchivedTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setArchivedTasks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<TaskSummary[]>("list_archived_tasks", { projectId })
      .then((result) => {
        if (!cancelled) setArchivedTasks(result);
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
  }, [projectId]);

  // Exposed for callers that need to pull a fresh list on demand (e.g.
  // archiving a task while "Show hidden" is on) — deliberately not shared
  // with the effect above; see the equivalent note in useTasks.ts.
  const refresh = useCallback(async () => {
    if (!projectId) {
      setArchivedTasks([]);
      return;
    }
    const result = await invoke<TaskSummary[]>("list_archived_tasks", {
      projectId,
    });
    setArchivedTasks(result);
    return result;
  }, [projectId]);

  // Restoring is coordinated by the caller: this only owns the archived
  // list, so it drops the task locally once the backend confirms it — the
  // caller is responsible for refreshing the active task list (a different
  // hook instance) so the restored task reappears on the board.
  async function unarchiveTask(taskId: string) {
    await invoke("unarchive_task", { id: taskId });
    setArchivedTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  return { archivedTasks, loading, error, refresh, unarchiveTask };
}
