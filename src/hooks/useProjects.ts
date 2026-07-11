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

// `refreshKey` exists because this hook is called from more than one place
// at once (the sidebar tree and the open project's panel each hold their
// own instance, with no shared cache) — bumping it forces a re-fetch, which
// is how an archive triggered from one instance gets reflected in the
// other's list. See App.tsx's projectsVersion.
export function useProjects(workspaceId: string | null, refreshKey: unknown = null) {
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
  }, [workspaceId, refreshKey]);

  async function createProject(name: string) {
    if (!workspaceId) return;
    const created = await invoke<Project>("create_project", {
      workspaceId,
      name,
      description: null,
    });
    setProjects((prev) => [...prev, created]);
  }

  // Soft delete: the backend keeps the row (archived = true) and its tasks,
  // browsable later via list_archived_projects (see useArchivedProjects).
  async function archiveProject(projectId: string) {
    await invoke("archive_project", { id: projectId });
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  return { projects, loading, error, createProject, archiveProject };
}
