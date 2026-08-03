import { useEffect, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { confirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";

interface ManageableItemRowProps {
  title: string;
  displayLabel?: string;
  entityLabel: string;
  onRename: (title: string) => Promise<unknown>;
  onDelete?: () => Promise<void>;
  confirmTitle?: string;
  confirmMessage?: string;
  onSelect?: () => void;
  selected?: boolean;
}

// Shared row for lists of renameable items: plain text (or a select button,
// when `onSelect` is given) with a hover-revealed rename icon, swapping to
// an inline Input on rename rather than opening another dialog. Delete is
// optional — omit `onDelete` for rename-only rows (e.g. project rows in
// WorkspaceTreeItem, which have their own separate archive flow instead).
export function ManageableItemRow({
  title,
  displayLabel,
  entityLabel,
  onRename,
  onDelete,
  confirmTitle,
  confirmMessage,
  onSelect,
  selected,
}: ManageableItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === title) {
      setDraft(title);
      setEditing(false);
      return;
    }
    try {
      await onRename(trimmed);
      setError(null);
      setEditing(false);
    } catch (err) {
      setError(String(err));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(title);
      setEditing(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setError(null);
    const confirmed = await confirm(confirmMessage ?? "", {
      title: confirmTitle ?? "Delete?",
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      await onDelete();
      toast({ title: `${entityLabel} deleted`, description: title });
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="group flex items-center gap-1 rounded-md px-1 hover:bg-muted">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="h-7"
          />
        ) : onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm text-muted-foreground",
              selected && "bg-accent text-foreground",
            )}
          >
            {displayLabel ?? title}
          </button>
        ) : (
          <p className="min-w-0 flex-1 truncate px-1.5 py-1 text-sm">
            {displayLabel ?? title}
          </p>
        )}
        {!editing && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100"
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
              <span className="sr-only">Rename {title}</span>
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={handleDelete}
              >
                <Trash2Icon />
                <span className="sr-only">Delete {title}</span>
              </Button>
            )}
          </>
        )}
      </div>
      {error && <p className="px-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
