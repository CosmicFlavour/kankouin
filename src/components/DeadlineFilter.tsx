import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { DEADLINE_FILTER_BUCKETS } from "@/lib/deadline";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface DeadlineFilterProps {
  selectedBuckets: string[];
  onChange: (buckets: string[]) => void;
}

export function DeadlineFilter({
  selectedBuckets,
  onChange,
}: DeadlineFilterProps) {
  const [open, setOpen] = useState(false);

  function toggle(bucket: string) {
    onChange(
      selectedBuckets.includes(bucket)
        ? selectedBuckets.filter((b) => b !== bucket)
        : [...selectedBuckets, bucket],
    );
  }

  const label =
    selectedBuckets.length === 0
      ? "All deadlines"
      : selectedBuckets.length === 1
        ? (DEADLINE_FILTER_BUCKETS.find((b) => b.value === selectedBuckets[0])
            ?.label ?? "1 deadline")
        : `${selectedBuckets.length} deadlines`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          {label}
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        {DEADLINE_FILTER_BUCKETS.map((bucket) => (
          <label key={bucket.value} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedBuckets.includes(bucket.value)}
              onChange={() => toggle(bucket.value)}
            />
            {bucket.label}
          </label>
        ))}
        {selectedBuckets.length > 0 && (
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
