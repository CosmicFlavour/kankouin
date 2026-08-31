import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_AI_TIMEOUT_SECONDS = 120;

export interface AIConnection {
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  timeout_seconds: number;
  // Optional path to a PEM file with extra CA cert(s) to trust (internal
  // networks whose TLS certs aren't in the public roots). null = stock trust.
  ca_certificate_path: string | null;
}

export interface Settings {
  last_sync_file_path: string | null;
  theme: string | null;
  ai_connection: AIConnection | null;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    last_sync_file_path: null,
    theme: null,
    ai_connection: null,
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

  async function setAiConnection(
    provider: string,
    baseUrl: string,
    apiKey: string,
    model: string,
    timeoutSeconds: number,
    caCertificatePath: string | null,
  ) {
    const updated = await invoke<Settings>("set_ai_connection", {
      provider,
      baseUrl,
      apiKey,
      model,
      timeoutSeconds,
      caCertificatePath,
    });
    setSettings(updated);
  }

  async function clearAiConnection() {
    const updated = await invoke<Settings>("clear_ai_connection");
    setSettings(updated);
  }

  return {
    settings,
    setLastSyncFilePath,
    setTheme,
    setAiConnection,
    clearAiConnection,
  };
}
