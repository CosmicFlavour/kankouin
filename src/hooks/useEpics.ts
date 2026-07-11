import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Epic {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function useEpics(projectId: string | null) {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setEpics([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<Epic[]>("list_epics", { projectId })
      .then((result) => {
        if (!cancelled) setEpics(result);
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

  async function createEpic(title: string) {
    if (!projectId) return;
    const created = await invoke<Epic>("create_epic", {
      projectId,
      title,
      description: null,
    });
    setEpics((prev) => [...prev, created]);
    return created;
  }

  // Hard delete, but non-destructive to tasks: the backend only cascades
  // away the epic and its user stories — any task attached to either gets
  // unlinked back to the bare project (epic_id/user_story_id -> NULL) rather
  // than deleted (see migrations/0001_init.sql).
  async function deleteEpic(epicId: string) {
    await invoke("delete_epic", { id: epicId });
    setEpics((prev) => prev.filter((e) => e.id !== epicId));
  }

  return { epics, loading, error, createEpic, deleteEpic };
}
