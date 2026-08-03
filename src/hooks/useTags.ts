import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Tag } from "@/hooks/useTasks";

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<Tag[]>("list_tags")
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
  }, []);

  async function createTag(name: string, color: string) {
    const created = await invoke<Tag>("create_tag", { name, color });
    setTags((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return created;
  }

  async function updateTag(tagId: string, name: string, color: string) {
    const updated = await invoke<Tag>("update_tag", { id: tagId, name, color });
    setTags((prev) =>
      prev
        .map((t) => (t.id === tagId ? updated : t))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    return updated;
  }

  // Hard delete: removes the tag and every task's association with it.
  // Tasks already loaded elsewhere (e.g. a board's cached task list) may
  // keep a stale copy of this tag on their `tags` array until they next
  // refetch — cosmetic only, and self-corrects on the next list_tasks call.
  async function deleteTag(tagId: string) {
    await invoke("delete_tag", { id: tagId });
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  return { tags, loading, error, createTag, updateTag, deleteTag };
}
