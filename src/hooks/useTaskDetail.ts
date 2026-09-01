import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Tag, Task } from "@/hooks/useTasks";

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  sort_order: number;
  created_at: string;
}

export interface TaskDetail {
  task: Task;
  subtasks: Subtask[];
  tags: Tag[];
  blocked_by: Task[];
}

// Mirrors the backend's `ai::ChatTurnResult` — `reply` is never shown,
// only `actions.length` (how many subtasks actually got added) matters
// to the caller.
export interface BreakIntoSubtasksResult {
  reply: string;
  actions: unknown[];
}

export function useTaskDetail(taskId: string | null) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<TaskDetail>("get_task", { id: taskId })
      .then((result) => {
        if (!cancelled) setDetail(result);
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
  }, [taskId]);

  async function addSubtask(title: string) {
    if (!taskId) return;
    const created = await invoke<Subtask>("add_subtask", {
      taskId,
      title,
    });
    setDetail((prev) =>
      prev ? { ...prev, subtasks: [...prev.subtasks, created] } : prev,
    );
  }

  async function toggleSubtask(subtaskId: string) {
    const updated = await invoke<Subtask>("toggle_subtask", { id: subtaskId });
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            subtasks: prev.subtasks.map((s) =>
              s.id === subtaskId ? updated : s,
            ),
          }
        : prev,
    );
  }

  async function refresh() {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<TaskDetail>("get_task", { id: taskId });
      setDetail(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  // AI-driven, so unlike `addSubtask` there's nothing to optimistically
  // patch in — refetch the whole detail to pick up however many subtasks
  // (zero or more) the AI actually added.
  async function breakIntoSubtasks() {
    if (!taskId) throw new Error("no task selected");
    const result = await invoke<BreakIntoSubtasksResult>(
      "break_task_into_subtasks",
      { taskId },
    );
    await refresh();
    return result;
  }

  return {
    detail,
    loading,
    error,
    addSubtask,
    toggleSubtask,
    refresh,
    breakIntoSubtasks,
  };
}
