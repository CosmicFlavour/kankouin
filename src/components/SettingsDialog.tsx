import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DatabasePanel } from "@/components/DatabasePanel";
import { CloudSyncPanel } from "@/components/CloudSyncPanel";

// Database file management and cloud sync config — occasional-use settings
// that used to sit permanently inline in the sidebar. Moved behind a gear
// icon now that the sidebar is gone, same components (DatabasePanel,
// CloudSyncPanel) unchanged, just a new host.
export function SettingsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm">
          <SettingsIcon />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <DatabasePanel />
          <CloudSyncPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
