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

  async function createTask(
    fields: { title: string; description?: string | null; priority?: string },
    attachment?: { epicId?: string | null; userStoryId?: string | null },
  ) {
    if (!projectId) return;
    const created = await invoke<Task>("create_task", {
      projectId,
      title: fields.title,
      description: fields.description ?? null,
      epicId: attachment?.epicId ?? null,
      userStoryId: attachment?.userStoryId ?? null,
      priority: fields.priority ?? null,
    });
    // A freshly created task has no tags yet and can't be blocked (no
    // dependency has had a chance to be set), so this is exact, not a guess.
    setTasks((prev) => [...prev, { ...created, tags: [], blocked: false }]);
  }

  async function moveTask(taskId: string, newState: string) {
    const updated = await invoke<Task>("update_task_state", {
      id: taskId,
      newState,
    });
    // The command returns a plain Task (no tags/blocked), so merge it into
    // the existing summary rather than replacing it wholesale.
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
    );
  }

  async function updateTask(
    taskId: string,
    fields: { title?: string; description?: string; priority?: string },
  ) {
    const updated = await invoke<Task>("update_task", {
      id: taskId,
      title: fields.title ?? null,
      description: fields.description ?? null,
      priority: fields.priority ?? null,
      epicId: null,
      userStoryId: null,
    });
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
    );
  }

  async function setDeadline(
    taskId: string,
    deadlineType: "exact" | "fuzzy",
    value: string,
  ) {
    const updated = await invoke<Task>("set_deadline", {
      id: taskId,
      deadlineType,
      exactDate: deadlineType === "exact" ? value : null,
      fuzzyBucket: deadlineType === "fuzzy" ? value : null,
    });
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
    );
  }

  async function setTaskTags(taskId: string, tagIds: string[], allTags: Tag[]) {
    await invoke("set_task_tags", { taskId, tagIds });
    const tags = allTags.filter((tag) => tagIds.includes(tag.id));
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, tags } : t)),
    );
  }

  async function setTaskParent(
    taskId: string,
    epicId: string | null,
    userStoryId: string | null,
  ) {
    const updated = await invoke<Task>("set_task_parent", {
      id: taskId,
      epicId,
      userStoryId,
    });
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
    );
  }

  return {
    tasks,
    loading,
    error,
    createTask,
    moveTask,
    updateTask,
    setDeadline,
    setTaskTags,
    setTaskParent,
  };
}
