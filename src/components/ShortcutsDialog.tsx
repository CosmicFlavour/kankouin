import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "n", action: "New task (while a project is open)" },
  { keys: "t", action: "Next project (cycles across all workspaces)" },
  { keys: "r", action: "Previous project (cycles across all workspaces)" },
  { keys: "o", action: "Go to Today / This Week view" },
  { keys: "s or /", action: "Go to Search view" },
  { keys: "a", action: "Toggle the AI assistant sidebar" },
  { keys: "F1", action: "Show this shortcuts list" },
  { keys: "Ctrl+Q / Cmd+Q", action: "Quit the app" },
];

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} className="border-b last:border-0">
                <td className="py-1.5 pr-4 align-top">
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {s.keys}
                  </kbd>
                </td>
                <td className="py-1.5 text-muted-foreground">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Shortcuts are ignored while typing in a text field or while a
          dialog is open.
        </p>
      </DialogContent>
    </Dialog>
  );
}
