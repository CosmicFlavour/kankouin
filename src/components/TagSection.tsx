import { useState } from "react";
import type { Tag } from "@/hooks/useTasks";
import { useTags } from "@/hooks/useTags";

export function TagSection({
  taskTags,
  onChangeTags,
}: {
  taskTags: Tag[];
  onChangeTags: (tagIds: string[], allTags: Tag[]) => Promise<void>;
}) {
  const { tags, loading, error } = useTags();
  const [toggleError, setToggleError] = useState<string | null>(null);

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

  return (
    <div>
      <dt className="text-muted-foreground">Tags</dt>
      <dd className="mt-1 flex flex-col gap-2">
        {loading && <p className="text-muted-foreground">Loading...</p>}
        {error && (
          <p className="text-muted-foreground">Couldn't load tags: {error}</p>
        )}
        {tags.length === 0 && !loading && (
          <p className="text-muted-foreground">
            No tags yet — create one from the Tags view
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const checked = taskTags.some((t) => t.id === tag.id);
            return (
              <label
                key={tag.id}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
              >
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
            );
          })}
        </div>
        {toggleError && <p className="text-destructive">{toggleError}</p>}
      </dd>
    </div>
  );
}
