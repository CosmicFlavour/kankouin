import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SyncPanel() {
  const { settings, setLastSyncFilePath } = useSettings();
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setStatus(null);
    setError(null);
    if (!passphrase) {
      setError("Enter a passphrase first");
      return;
    }

    const filePath = await save({
      defaultPath: settings.last_sync_file_path ?? undefined,
    });
    if (!filePath) return;

    try {
      await invoke("export_encrypted", { passphrase, filePath });
      await setLastSyncFilePath(filePath);
      setStatus("Exported");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleImport() {
    setStatus(null);
    setError(null);
    if (!passphrase) {
      setError("Enter a passphrase first");
      return;
    }

    const filePath = await open({
      defaultPath: settings.last_sync_file_path ?? undefined,
      multiple: false,
    });
    if (!filePath || Array.isArray(filePath)) return;

    const confirmed = await confirm(
      "Importing will overwrite all local data with the contents of this file. This can't be undone.",
      { title: "Import and overwrite local data?", kind: "warning" },
    );
    if (!confirmed) return;

    try {
      await invoke("import_encrypted", { passphrase, filePath });
      await setLastSyncFilePath(filePath);
      setStatus("Imported — reloading...");
      window.location.reload();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-medium text-muted-foreground">Sync</h2>
      <Input
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="Passphrase"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={handleExport}>
          Export
        </Button>
        <Button type="button" variant="outline" onClick={handleImport}>
          Import
        </Button>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
