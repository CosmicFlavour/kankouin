import { useState } from "react";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { FilePlus2Icon, FolderOpenIcon } from "lucide-react";
import { useDatabaseStatus } from "@/hooks/useDatabaseStatus";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";

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
      toast({ title: "Database created", description: "Reloading..." });
      setTimeout(() => window.location.reload(), 600);
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
      toast({ title: "Database opened", description: "Reloading..." });
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setBusy(false);
    }
  }

  if (!status || status.status !== "ok") return null;

  return (
    <div className="mt-3 border-b border-border pb-3">
      <div className="flex items-center gap-1">
        <p
          className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
          title={status.path}
        >
          {status.path}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Create a new database"
          onClick={handleCreate}
          disabled={busy}
        >
          <FilePlus2Icon />
          <span className="sr-only">Create a new database</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Open a different database"
          onClick={handleOpen}
          disabled={busy}
        >
          <FolderOpenIcon />
          <span className="sr-only">Open a different database</span>
        </Button>
      </div>
      {actionError && <p className="mt-1 text-xs text-destructive">{actionError}</p>}
    </div>
  );
}
