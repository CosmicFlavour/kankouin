export const FUZZY_BUCKETS: { value: string; label: string; className: string }[] = [
  {
    value: "this_week",
    label: "This Week",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  {
    value: "this_month",
    label: "This Month",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  {
    value: "this_quarter",
    label: "This Quarter",
    className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  },
  {
    value: "someday",
    label: "Someday",
    className: "bg-muted text-muted-foreground",
  },
];

export function fuzzyBucketLabel(bucket: string): string {
  return FUZZY_BUCKETS.find((b) => b.value === bucket)?.label ?? bucket;
}

export function fuzzyBucketClassName(bucket: string): string {
  return (
    FUZZY_BUCKETS.find((b) => b.value === bucket)?.className ??
    "bg-muted text-muted-foreground"
  );
}

function todayISODate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function exactDateUrgency(
  exactDate: string,
  now = new Date(),
): "overdue" | "today" | "normal" {
  const today = todayISODate(now);
  if (exactDate < today) return "overdue";
  if (exactDate === today) return "today";
  return "normal";
}

export function formatExactDate(exactDate: string): string {
  const [y, m, d] = exactDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
