export const TASK_STATES: {
  state: string;
  label: string;
  dotClassName: string;
  columnClassName: string;
}[] = [
  {
    state: "todo",
    label: "Todo",
    dotClassName: "bg-muted-foreground/50",
    columnClassName: "bg-muted/40",
  },
  {
    state: "doing",
    label: "Doing",
    dotClassName: "bg-primary",
    columnClassName: "bg-primary/5 dark:bg-primary/10",
  },
  {
    state: "under_review",
    label: "Under Review",
    dotClassName: "bg-amber-500",
    columnClassName: "bg-amber-50/60 dark:bg-amber-950/20",
  },
  {
    state: "done",
    label: "Done",
    dotClassName: "bg-green-500",
    columnClassName: "bg-green-50/60 dark:bg-green-950/20",
  },
];
