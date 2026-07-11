import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Workspace {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    invoke<Workspace[]>("list_workspaces")
      .then((result) => {
        if (!cancelled) setWorkspaces(result);
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

  async function createWorkspace(name: string) {
    const created = await invoke<Workspace>("create_workspace", {
      name,
      color: null,
      icon: null,
    });
    setWorkspaces((prev) => [...prev, created]);
  }

  // Hard delete: cascades to every project, epic, story, task and tag in
  // the workspace (see migrations/0001_init.sql). There is no undo.
  async function deleteWorkspace(workspaceId: string) {
    await invoke("delete_workspace", { id: workspaceId });
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
  }

  return { workspaces, loading, error, createWorkspace, deleteWorkspace };
}
