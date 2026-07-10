export function priorityCardClassName(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900";
    case "medium":
      return "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900";
    default:
      return "bg-muted border-border";
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
