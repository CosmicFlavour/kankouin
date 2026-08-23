import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "@/hooks/useProjects";
import type { Workspace } from "@/hooks/useWorkspaces";

// Flattens every workspace's project list into a single ordered list
// (workspace order, then each workspace's project order) so shortcuts like
// project-cycling can move across workspace boundaries. Workspace-scoped
// views keep using useProjects directly; this is only for cross-workspace
// iteration.
export function useAllProjects(workspaces: Workspace[], refreshKey: unknown = null) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (workspaces.length === 0) {
      setProjects([]);
      return;
    }

    let cancelled = false;

    Promise.all(
      workspaces.map((w) =>
        invoke<Project[]>("list_projects", { workspaceId: w.id }),
      ),
    )
      .then((results) => {
        if (!cancelled) setProjects(results.flat());
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaces, refreshKey]);

  return projects;
}
