import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "@/hooks/useWorkspaces";
import type { Project } from "@/hooks/useProjects";

export interface ProjectDirectoryEntry {
  workspaceId: string;
  workspaceName: string;
  projectName: string;
}

// Cross-project views (Today/This Week, Tags) get tasks back with only a
// project_id, so this resolves each one to its workspace/project name for
// display — bounded by workspace/project count, not task count.
export function useProjectDirectory() {
  const [directory, setDirectory] = useState<
    Map<string, ProjectDirectoryEntry>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<Workspace[]>("list_workspaces")
      .then(async (workspaces) => {
        const projectLists = await Promise.all(
          workspaces.map((workspace) =>
            invoke<Project[]>("list_projects", { workspaceId: workspace.id }),
          ),
        );
        if (cancelled) return;

        const next = new Map<string, ProjectDirectoryEntry>();
        workspaces.forEach((workspace, i) => {
          for (const project of projectLists[i]) {
            next.set(project.id, {
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              projectName: project.name,
            });
          }
        });
        setDirectory(next);
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

  return { directory, loading, error };
}
