import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { DbStatus } from "@/hooks/useDatabaseStatus";
import { Button } from "@/components/ui/button";

interface DatabaseSetupScreenProps {
  status: Exclude<DbStatus, { status: "ok" }>;
  onCreateDatabaseFile: (path: string) => Promise<unknown>;
  onOpenDatabaseFile: (path: string) => Promise<unknown>;
}

const FILE_FILTERS = [{ name: "Kankouin database", extensions: ["sqlite3", "db"] }];

export function DatabaseSetupScreen({
  status,
  onCreateDatabaseFile,
  onOpenDatabaseFile,
}: DatabaseSetupScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    const filePath = await save({
      defaultPath: "kankouin.sqlite3",
      filters: FILE_FILTERS,
    });
    if (!filePath) return;

    setBusy(true);
    try {
      await onCreateDatabaseFile(filePath);
      window.location.reload();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  async function handleOpen() {
    setError(null);
    const filePath = await open({ multiple: false, filters: FILE_FILTERS });
    if (!filePath || Array.isArray(filePath)) return;

    setBusy(true);
    try {
      await onOpenDatabaseFile(filePath);
      window.location.reload();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <h1 className="text-lg font-semibold">
        {status.status === "not_configured"
          ? "Welcome to Kankouin"
          : "Couldn't load your database"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {status.status === "not_configured" &&
          "Create a new database file, or open one you've used before."}
        {status.status === "missing" &&
          `We couldn't find a database file at ${status.path}. It may have been moved or deleted.`}
        {status.status === "error" &&
          `We couldn't open the database at ${status.path}: ${status.message}`}
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={handleCreate} disabled={busy}>
          Create new database
        </Button>
        <Button type="button" variant="outline" onClick={handleOpen} disabled={busy}>
          Open existing database
        </Button>
      </div>
      {error && <p className="max-w-md text-sm text-destructive">{error}</p>}
    </div>
  );
}
