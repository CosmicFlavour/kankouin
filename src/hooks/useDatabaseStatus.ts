import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type DbStatus =
  | { status: "ok"; path: string }
  | { status: "not_configured" }
  | { status: "missing"; path: string }
  | { status: "error"; path: string; message: string };

export function useDatabaseStatus() {
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await invoke<DbStatus>("get_database_status");
    setStatus(result);
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch(() => {
        // No status yet (e.g. no Tauri runtime in dev/tests) — treat as
        // unconfigured rather than leaving the app stuck loading forever.
        if (!cancelled) setStatus({ status: "not_configured" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function createDatabaseFile(path: string) {
    setActionError(null);
    try {
      const result = await invoke<DbStatus>("create_database_file", { path });
      setStatus(result);
      return result;
    } catch (err) {
      setActionError(String(err));
      throw err;
    }
  }

  async function openDatabaseFile(path: string) {
    setActionError(null);
    try {
      const result = await invoke<DbStatus>("open_database_file", { path });
      setStatus(result);
      return result;
    } catch (err) {
      setActionError(String(err));
      throw err;
    }
  }

  return {
    status,
    loading,
    actionError,
    refresh,
    createDatabaseFile,
    openDatabaseFile,
  };
}
