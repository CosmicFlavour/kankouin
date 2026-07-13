import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface CloudProviderInfo {
  id: string;
  display_name: string;
}

export type CloudStatus =
  | { status: "not_connected" }
  | {
      status: "connected";
      provider: string;
      account_label: string | null;
      has_passphrase: boolean;
    };

export function useCloudSync() {
  const [providers, setProviders] = useState<CloudProviderInfo[]>([]);
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await invoke<CloudStatus>("get_cloud_status");
    setStatus(result);
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [providerList, statusResult] = await Promise.all([
          invoke<CloudProviderInfo[]>("list_cloud_providers"),
          invoke<CloudStatus>("get_cloud_status"),
        ]);
        if (!cancelled) {
          setProviders(providerList);
          setStatus(statusResult);
        }
      } catch {
        // No Tauri runtime (e.g. dev/tests) — treat as disconnected rather
        // than leaving the panel stuck loading forever.
        if (!cancelled) setStatus({ status: "not_connected" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect(providerId: string) {
    setActionError(null);
    try {
      const result = await invoke<CloudStatus>("start_cloud_connect", {
        providerId,
      });
      setStatus(result);
      return result;
    } catch (err) {
      setActionError(String(err));
      throw err;
    }
  }

  async function disconnect() {
    setActionError(null);
    try {
      const result = await invoke<CloudStatus>("disconnect_cloud");
      setStatus(result);
      return result;
    } catch (err) {
      setActionError(String(err));
      throw err;
    }
  }

  async function setPassphrase(passphrase: string) {
    setActionError(null);
    try {
      const result = await invoke<CloudStatus>("set_cloud_passphrase", {
        passphrase,
      });
      setStatus(result);
      return result;
    } catch (err) {
      setActionError(String(err));
      throw err;
    }
  }

  async function push() {
    setActionError(null);
    try {
      await invoke("push_to_cloud");
    } catch (err) {
      setActionError(String(err));
      throw err;
    }
  }

  async function pull() {
    setActionError(null);
    try {
      await invoke("pull_from_cloud");
    } catch (err) {
      setActionError(String(err));
      throw err;
    }
  }

  return {
    providers,
    status,
    loading,
    actionError,
    refresh,
    connect,
    disconnect,
    setPassphrase,
    push,
    pull,
  };
}
