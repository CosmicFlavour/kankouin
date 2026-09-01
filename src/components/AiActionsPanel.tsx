import { useEffect } from "react";
import { useAiActionLog } from "@/hooks/useAiActionLog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AiActionsPanelProps {
  onMutation?: () => void;
}

// Radix's TabsContent unmounts inactive panels, so mounting this re-fetches
// the log every time the user switches to the tab — good enough freshness
// without a live-update mechanism, since the chat input (the only way to
// trigger a new action) isn't reachable while this tab is showing.
export function AiActionsPanel({ onMutation }: AiActionsPanelProps) {
  const { actions, loading, error, refresh, revert } =
    useAiActionLog(onMutation);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {loading && actions.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {!loading && actions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Actions the AI takes on your board will show up here, and can be
          reverted at any time.
        </p>
      )}
      {actions.map((action) => (
        <div
          key={action.id}
          className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                action.reverted_at && "text-muted-foreground line-through",
              )}
            >
              {action.summary}
            </span>
            {action.revertible && !action.reverted_at && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => revert(action.id)}
              >
                Revert
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(action.created_at).toLocaleString()}
          </span>
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
