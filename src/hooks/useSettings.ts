import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  last_sync_file_path: string | null;
  theme: string | null;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    last_sync_file_path: null,
    theme: null,
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

  useEffect(() => {
    // No stored preference yet (first run) falls back to the OS preference
    // rather than hardcoding light mode.
    const isDark = settings.theme
      ? settings.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
  }, [settings.theme]);

  async function setLastSyncFilePath(path: string) {
    const updated = await invoke<Settings>("set_last_sync_file_path", { path });
    setSettings(updated);
  }

  async function setTheme(theme: "light" | "dark") {
    const updated = await invoke<Settings>("set_theme", { theme });
    setSettings(updated);
  }

  return { settings, setLastSyncFilePath, setTheme };
}
