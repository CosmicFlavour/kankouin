import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UserStory {
  id: string;
  project_id: string;
  epic_id: string | null;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function useUserStories(projectId: string | null) {
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setUserStories([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<UserStory[]>("list_user_stories", { projectId })
      .then((result) => {
        if (!cancelled) setUserStories(result);
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

  async function createUserStory(title: string, epicId: string | null) {
    if (!projectId) return;
    const created = await invoke<UserStory>("create_user_story", {
      projectId,
      epicId,
      title,
      description: null,
    });
    setUserStories((prev) => [...prev, created]);
    return created;
  }

  // Rename only; description and epic re-parenting aren't editable from any
  // UI yet, so both are left untouched (the backend COALESCEs a null field
  // to the existing value).
  async function updateUserStory(storyId: string, title: string) {
    const updated = await invoke<UserStory>("update_user_story", {
      id: storyId,
      title,
      description: null,
      epicId: null,
    });
    setUserStories((prev) =>
      prev.map((s) => (s.id === storyId ? updated : s)),
    );
    return updated;
  }

  // Hard delete, but non-destructive to tasks: attached tasks get unlinked
  // (user_story_id -> NULL) rather than deleted (see
  // migrations/0001_init.sql).
  async function deleteUserStory(storyId: string) {
    await invoke("delete_user_story", { id: storyId });
    setUserStories((prev) => prev.filter((s) => s.id !== storyId));
  }

  return {
    userStories,
    loading,
    error,
    createUserStory,
    updateUserStory,
    deleteUserStory,
  };
}
