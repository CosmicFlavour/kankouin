import { useState } from "react";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { useDatabaseStatus } from "@/hooks/useDatabaseStatus";
import { Button } from "@/components/ui/button";

const FILE_FILTERS = [{ name: "Kankouin database", extensions: ["sqlite3", "db"] }];

export function DatabasePanel() {
  const { status, createDatabaseFile, openDatabaseFile, actionError } =
    useDatabaseStatus();
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const filePath = await save({
      defaultPath: "kankouin.sqlite3",
      filters: FILE_FILTERS,
    });
    if (!filePath) return;

    const confirmed = await confirm(
      "Kankouin will switch to this new, empty database. Your current data stays exactly where it is and isn't affected.",
      { title: "Create a new database?", kind: "warning" },
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await createDatabaseFile(filePath);
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  async function handleOpen() {
    const filePath = await open({ multiple: false, filters: FILE_FILTERS });
    if (!filePath || Array.isArray(filePath)) return;

    const confirmed = await confirm(
      "Kankouin will switch to this database file. Your current data stays exactly where it is and isn't affected.",
      { title: "Open a different database?", kind: "warning" },
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await openDatabaseFile(filePath);
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  if (!status || status.status !== "ok") return null;

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-medium text-muted-foreground">Database</h2>
      <p className="truncate text-xs text-muted-foreground" title={status.path}>
        {status.path}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleCreate} disabled={busy}>
          New
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleOpen} disabled={busy}>
          Open different
        </Button>
      </div>
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
    </div>
  );
}
