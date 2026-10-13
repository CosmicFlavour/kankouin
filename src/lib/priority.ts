// Left-accent border color for a task card — the card's own background and
// border stay neutral (set by the caller); priority shows as a thin colored
// bar down the left edge instead of tinting the whole card, so a board full
// of high-priority tasks doesn't read as a wall of red.
export function priorityCardClassName(priority: string): string {
  switch (priority) {
    case "high":
      return "border-l-red-500 dark:border-l-red-500";
    case "medium":
      return "border-l-amber-500 dark:border-l-amber-400";
    default:
      return "border-l-transparent";
  }
}

export function priorityButtonClassName(
  priority: string,
  selected: boolean,
): string {
  if (!selected) return "text-muted-foreground hover:bg-muted";

  switch (priority) {
    case "high":
      return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200";
    case "medium":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200";
    default:
      return "bg-muted text-foreground";
  }
}
