import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "@/hooks/useProjects";

// Read-only and fetched lazily: pass `null` (e.g. while a disclosure row is
// collapsed) to skip fetching, and the real workspaceId once the caller
// wants the list — every transition from null to a real id re-fetches, so
// reopening the disclosure always shows a fresh list rather than a stale
// one from before some other view archived a project.
export function useArchivedProjects(workspaceId: string | null) {
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setArchivedProjects([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<Project[]>("list_archived_projects", { workspaceId })
      .then((result) => {
        if (!cancelled) setArchivedProjects(result);
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

  return { archivedProjects, loading, error };
}
