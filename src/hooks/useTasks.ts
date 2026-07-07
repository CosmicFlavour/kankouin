import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Tag {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  project_id: string;
  epic_id: string | null;
  user_story_id: string | null;
  title: string;
  description: string | null;
  state: string;
  priority: string;
  deadline_type: string | null;
  exact_date: string | null;
  fuzzy_bucket: string | null;
  bucket_period: string | null;
  state_since: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskSummary extends Task {
  tags: Tag[];
  blocked: boolean;
}

export function useTasks(projectId: string | null) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<TaskSummary[]>("list_tasks", { projectId })
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
  }, [projectId]);

  async function createTask(title: string) {
    if (!projectId) return;
    const created = await invoke<Task>("create_task", {
      projectId,
      title,
      description: null,
      epicId: null,
      userStoryId: null,
      priority: null,
    });
    // A freshly created task has no tags yet and can't be blocked (no
    // dependency has had a chance to be set), so this is exact, not a guess.
    setTasks((prev) => [...prev, { ...created, tags: [], blocked: false }]);
  }

  return { tasks, loading, error, createTask };
}
