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
