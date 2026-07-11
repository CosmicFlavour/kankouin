import { useState } from "react";
import { XIcon } from "lucide-react";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Tag } from "@/hooks/useTasks";
import { useTags } from "@/hooks/useTags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TagSection({
  workspaceId,
  taskTags,
  onChangeTags,
}: {
  workspaceId: string;
  taskTags: Tag[];
  onChangeTags: (tagIds: string[], allTags: Tag[]) => Promise<void>;
}) {
  const { tags, loading, error, createTag, deleteTag } = useTags(workspaceId);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#888888");
  const [createError, setCreateError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(tag: Tag) {
    setDeleteError(null);
    const confirmed = await confirm(
      `Delete the "${tag.name}" tag? It will be removed from every task that has it.`,
      { title: "Delete tag?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await deleteTag(tag.id);
    } catch (err) {
      setDeleteError(String(err));
    }
  }

  async function handleToggle(tagId: string) {
    const selectedIds = taskTags.map((t) => t.id);
    const nextIds = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    try {
      await onChangeTags(nextIds, tags);
      setToggleError(null);
    } catch (err) {
      setToggleError(String(err));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      await createTag(newTagName.trim(), newTagColor);
      setNewTagName("");
      setCreateError(null);
    } catch (err) {
      setCreateError(String(err));
    }
  }

  return (
    <div>
      <dt className="text-muted-foreground">Tags</dt>
      <dd className="mt-1 flex flex-col gap-2">
        {loading && <p className="text-muted-foreground">Loading...</p>}
        {error && (
          <p className="text-muted-foreground">Couldn't load tags: {error}</p>
        )}
        {tags.length === 0 && !loading && (
          <p className="text-muted-foreground">No tags in this workspace yet</p>
        )}
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const checked = taskTags.some((t) => t.id === tag.id);
            return (
              <span
                key={tag.id}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
              >
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggle(tag.id)}
                  />
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </label>
                <button
                  type="button"
                  onClick={() => handleDelete(tag)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <XIcon className="size-3" />
                  <span className="sr-only">Delete {tag.name}</span>
                </button>
              </span>
            );
          })}
        </div>
        {toggleError && <p className="text-destructive">{toggleError}</p>}
        {deleteError && <p className="text-destructive">{deleteError}</p>}

        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="New tag"
            className="h-8"
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className="h-8 w-8 shrink-0 rounded border border-border"
          />
          <Button type="submit" size="sm" variant="outline">
            Add tag
          </Button>
        </form>
        {createError && <p className="text-destructive">{createError}</p>}
      </dd>
    </div>
  );
}
