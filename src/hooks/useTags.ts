import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Tag } from "@/hooks/useTasks";

export function useTags(workspaceId: string | null) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setTags([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<Tag[]>("list_tags", { workspaceId })
      .then((result) => {
        if (!cancelled) setTags(result);
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

  async function createTag(name: string, color: string) {
    if (!workspaceId) return;
    const created = await invoke<Tag>("create_tag", {
      workspaceId,
      name,
      color,
    });
    setTags((prev) => [...prev, created]);
    return created;
  }

  return { tags, loading, error, createTag };
}
