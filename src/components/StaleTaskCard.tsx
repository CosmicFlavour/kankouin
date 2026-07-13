import { useState } from "react";
import type { TaskSummary } from "@/hooks/useTasks";
import { FUZZY_BUCKETS } from "@/lib/deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StaleTaskCardProps {
  task: TaskSummary;
  location: string | null;
  onMarkDone: () => Promise<void>;
  onMarkUnderReview: () => Promise<void>;
  onUpdateDeadline: (
    deadlineType: "exact" | "fuzzy",
    value: string,
  ) => Promise<void>;
  onSkip: () => void;
}

export function StaleTaskCard({
  task,
  location,
  onMarkDone,
  onMarkUnderReview,
  onUpdateDeadline,
  onSkip,
}: StaleTaskCardProps) {
  const [deadlineType, setDeadlineType] = useState<"exact" | "fuzzy">("exact");
  const [deadlineValue, setDeadlineValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stateSince = new Date(task.state_since).toLocaleDateString();

  async function run(action: () => Promise<void>) {
    try {
      await action();
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleUpdateDeadline(e: React.FormEvent) {
    e.preventDefault();
    if (!deadlineValue) return;
    await run(() => onUpdateDeadline(deadlineType, deadlineValue));
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{task.title}</p>
        {location && (
          <p className="text-xs text-muted-foreground">{location}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          In &ldquo;{task.state.replace("_", " ")}&rdquo; since {stateSince}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => run(onMarkDone)}>
          Mark Done
        </Button>
        {task.state !== "under_review" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => run(onMarkUnderReview)}
          >
            Mark Under Review
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>

      <form
        onSubmit={handleUpdateDeadline}
        className="flex flex-wrap items-center gap-2 border-t border-border pt-3"
      >
        <Select
          value={deadlineType}
          onValueChange={(value) => {
            const next = value as "exact" | "fuzzy";
            setDeadlineType(next);
            setDeadlineValue(next === "fuzzy" ? FUZZY_BUCKETS[0].value : "");
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exact">Exact date</SelectItem>
            <SelectItem value="fuzzy">Fuzzy</SelectItem>
          </SelectContent>
        </Select>
        {deadlineType === "exact" ? (
          <Input
            type="date"
            value={deadlineValue}
            onChange={(e) => setDeadlineValue(e.target.value)}
            className="w-auto"
          />
        ) : (
          <Select value={deadlineValue} onValueChange={setDeadlineValue}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUZZY_BUCKETS.map((bucket) => (
                <SelectItem key={bucket.value} value={bucket.value}>
                  {bucket.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button type="submit" size="sm" variant="outline">
          Update deadline
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
