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

  return { workspaces, loading, error, createWorkspace };
}
