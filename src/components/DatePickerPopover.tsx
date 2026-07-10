import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DatePickerPopoverProps {
  value: string;
  onSelect: (date: string) => void;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function startingPoint(value: string) {
  return value ? new Date(`${value}T00:00:00`) : new Date();
}

export function DatePickerPopover({ value, onSelect }: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => startingPoint(value).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => startingPoint(value).getMonth());

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const base = startingPoint(value);
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Sunday-first getDay() shifted to Monday-first leading blank count.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" title="Pick a date">
          <CalendarIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm font-medium">{monthLabel}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <span key={i} />;
            const iso = toISODate(viewYear, viewMonth, day);
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onSelect(iso);
                  setOpen(false);
                }}
                className={cn(
                  "rounded-md py-1 text-sm hover:bg-muted",
                  value === iso && "bg-accent text-foreground",
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
