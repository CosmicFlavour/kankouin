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

export interface TaskLogEntry {
  id: string;
  task_id: string;
  entry_type: string;
  content: string;
  created_at: string;
}

export interface TaskDetail {
  task: Task;
  subtasks: Subtask[];
  tags: Tag[];
  logs: TaskLogEntry[];
  blocked_by: Task[];
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

  return { detail, loading, error, addSubtask, toggleSubtask };
}
