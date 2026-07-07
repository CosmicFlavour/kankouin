import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  last_sync_file_path: string | null;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    last_sync_file_path: null,
  });

  useEffect(() => {
    let cancelled = false;
    invoke<Settings>("get_settings")
      .then((result) => {
        if (!cancelled) setSettings(result);
      })
      .catch(() => {
        // Settings are convenience-only; if they can't be loaded (e.g. no
        // Tauri runtime), just keep the empty defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setLastSyncFilePath(path: string) {
    const updated = await invoke<Settings>("set_last_sync_file_path", { path });
    setSettings(updated);
  }

  return { settings, setLastSyncFilePath };
}
