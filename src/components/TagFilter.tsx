import { useState } from "react";
import { BanIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import type { Tag } from "@/hooks/useTasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TagFilterValue {
  include: string[];
  exclude: string[];
}

interface TagFilterProps {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  value: TagFilterValue;
  onChange: (value: TagFilterValue) => void;
}

export function TagFilter({ tags, loading, error, value, onChange }: TagFilterProps) {
  const [open, setOpen] = useState(false);

  function toggleInclude(tagId: string) {
    onChange(
      value.include.includes(tagId)
        ? { ...value, include: value.include.filter((id) => id !== tagId) }
        : {
            include: [...value.include, tagId],
            exclude: value.exclude.filter((id) => id !== tagId),
          },
    );
  }

  function toggleExclude(tagId: string) {
    onChange(
      value.exclude.includes(tagId)
        ? { ...value, exclude: value.exclude.filter((id) => id !== tagId) }
        : {
            exclude: [...value.exclude, tagId],
            include: value.include.filter((id) => id !== tagId),
          },
    );
  }

  const includePart =
    value.include.length === 0
      ? null
      : value.include.length === 1
        ? (tags.find((t) => t.id === value.include[0])?.name ?? "1 tag")
        : `${value.include.length} tags`;
  const excludePart =
    value.exclude.length === 0 ? null : `excluding ${value.exclude.length}`;
  const label = [includePart, excludePart].filter(Boolean).join(", ") || "All tags";

  const hasSelection = value.include.length > 0 || value.exclude.length > 0;

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
          <p className="text-muted-foreground">No tags yet</p>
        )}
        {tags.map((tag) => {
          const included = value.include.includes(tag.id);
          const excluded = value.exclude.includes(tag.id);
          return (
            <div
              key={tag.id}
              className={cn(
                "flex items-center gap-2 rounded-md px-1 py-0.5",
                included && "bg-green-600/10 dark:bg-green-500/10",
                excluded && "bg-destructive/10",
              )}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1">{tag.name}</span>
              <button
                type="button"
                aria-pressed={included}
                aria-label={`Include ${tag.name}`}
                onClick={() => toggleInclude(tag.id)}
                className={cn(
                  "rounded border border-transparent p-0.5 text-muted-foreground hover:bg-muted",
                  included &&
                    "border-green-600/50 bg-green-600/15 text-green-700 hover:bg-green-600/20 dark:border-green-500/50 dark:bg-green-500/15 dark:text-green-400",
                )}
              >
                <CheckIcon
                  className="size-3.5"
                  strokeWidth={included ? 3 : 2}
                />
              </button>
              <button
                type="button"
                aria-pressed={excluded}
                aria-label={`Exclude ${tag.name}`}
                onClick={() => toggleExclude(tag.id)}
                className={cn(
                  "rounded border border-transparent p-0.5 text-muted-foreground hover:bg-muted",
                  excluded &&
                    "border-destructive/50 bg-destructive/15 text-destructive hover:bg-destructive/20",
                )}
              >
                <BanIcon
                  className="size-3.5"
                  strokeWidth={excluded ? 3 : 2}
                />
              </button>
            </div>
          );
        })}
        {hasSelection && (
          <button
            type="button"
            onClick={() => onChange({ include: [], exclude: [] })}
            className="mt-1 text-left text-xs text-muted-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
