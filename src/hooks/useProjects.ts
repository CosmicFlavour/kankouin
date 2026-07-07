import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export function useProjects(workspaceId: string | null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<Project[]>("list_projects", { workspaceId })
      .then((result) => {
        if (!cancelled) setProjects(result);
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
  }, [workspaceId]);

  async function createProject(name: string) {
    if (!workspaceId) return;
    const created = await invoke<Project>("create_project", {
      workspaceId,
      name,
      description: null,
    });
    setProjects((prev) => [...prev, created]);
  }

  return { projects, loading, error, createProject };
}
