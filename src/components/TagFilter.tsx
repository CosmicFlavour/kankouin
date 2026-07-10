import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { Tag } from "@/hooks/useTasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface TagFilterProps {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagFilter({
  tags,
  loading,
  error,
  selectedTagIds,
  onChange,
}: TagFilterProps) {
  const [open, setOpen] = useState(false);

  function toggle(tagId: string) {
    onChange(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId],
    );
  }

  const label =
    selectedTagIds.length === 0
      ? "All tags"
      : selectedTagIds.length === 1
        ? (tags.find((t) => t.id === selectedTagIds[0])?.name ?? "1 tag")
        : `${selectedTagIds.length} tags`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          {label}
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        {loading && <p className="text-muted-foreground">Loading...</p>}
        {error && (
          <p className="text-muted-foreground">Couldn't load tags: {error}</p>
        )}
        {!loading && !error && tags.length === 0 && (
          <p className="text-muted-foreground">No tags in this workspace yet</p>
        )}
        {tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedTagIds.includes(tag.id)}
              onChange={() => toggle(tag.id)}
            />
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
          </label>
        ))}
        {selectedTagIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 text-left text-xs text-muted-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
