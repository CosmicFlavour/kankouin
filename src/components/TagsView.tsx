import { useState } from "react";
import { PencilIcon, XIcon } from "lucide-react";
import { confirm } from "@/hooks/useConfirm";
import type { Tag } from "@/hooks/useTasks";
import { useTags } from "@/hooks/useTags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function TagRow({
  tag,
  onSave,
  onDelete,
}: {
  tag: Tag;
  onSave: (name: string, color: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onSave(name.trim(), color);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8"
          autoFocus
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-8 shrink-0 rounded border border-border"
        />
        <Button type="submit" size="sm" variant="outline">
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
        {error && <p className="text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="flex-1 text-sm">{tag.name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setEditing(true)}
      >
        <PencilIcon className="size-3.5" />
        <span className="sr-only">Rename {tag.name}</span>
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
        <XIcon className="size-3.5" />
        <span className="sr-only">Delete {tag.name}</span>
      </Button>
    </div>
  );
}

export function TagsView() {
  const { tags, loading, error, createTag, updateTag, deleteTag } = useTags();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#888888");
  const [createError, setCreateError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createTag(newName.trim(), newColor);
      setNewName("");
      setCreateError(null);
    } catch (err) {
      setCreateError(String(err));
    }
  }

  async function handleDelete(tag: Tag) {
    const confirmed = await confirm(
      `Delete the "${tag.name}" tag? It will be removed from every task that has it.`,
      { title: "Delete tag?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await deleteTag(tag.id);
      setRowError(null);
    } catch (err) {
      setRowError(String(err));
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="text-lg font-semibold">Tags</h2>

      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag"
          className="h-8"
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-8 w-8 shrink-0 rounded border border-border"
        />
        <Button type="submit" size="sm" variant="outline">
          Add tag
        </Button>
      </form>
      {createError && <p className="text-sm text-destructive">{createError}</p>}

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && (
        <p className="text-sm text-muted-foreground">
          Couldn't load tags: {error}
        </p>
      )}
      {!loading && !error && tags.length === 0 && (
        <p className="text-sm text-muted-foreground">No tags yet</p>
      )}
      <div className="flex flex-col gap-1">
        {tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            onSave={async (name, color) => {
              await updateTag(tag.id, name, color);
            }}
            onDelete={() => handleDelete(tag)}
          />
        ))}
      </div>
      {rowError && <p className="text-sm text-destructive">{rowError}</p>}
    </div>
  );
}
