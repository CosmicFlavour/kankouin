import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const PRIORITIES = ["low", "medium", "high"];

function dotClassName(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground";
  }
}

interface PriorityFilterProps {
  selectedPriorities: string[];
  onChange: (priorities: string[]) => void;
}

export function PriorityFilter({
  selectedPriorities,
  onChange,
}: PriorityFilterProps) {
  const [open, setOpen] = useState(false);

  function toggle(priority: string) {
    onChange(
      selectedPriorities.includes(priority)
        ? selectedPriorities.filter((p) => p !== priority)
        : [...selectedPriorities, priority],
    );
  }

  const label =
    selectedPriorities.length === 0
      ? "All priorities"
      : selectedPriorities.length === 1
        ? `${selectedPriorities[0][0].toUpperCase()}${selectedPriorities[0].slice(1)}`
        : `${selectedPriorities.length} priorities`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          {label}
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        {PRIORITIES.map((priority) => (
          <label key={priority} className="flex items-center gap-2 capitalize">
            <input
              type="checkbox"
              checked={selectedPriorities.includes(priority)}
              onChange={() => toggle(priority)}
            />
            <span className={`size-2 rounded-full ${dotClassName(priority)}`} />
            {priority}
          </label>
        ))}
        {selectedPriorities.length > 0 && (
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
