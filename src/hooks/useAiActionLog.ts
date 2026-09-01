import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@/hooks/useConfirm";

export interface AiActionLogEntry {
  id: string;
  tool_name: string;
  summary: string;
  task_id: string | null;
  revertible: boolean;
  reverted_at: string | null;
  created_at: string;
}

type RevertOutcome =
  | { status: "reverted"; task: unknown }
  | { status: "needs_confirmation" };

// Backs the standalone Actions tab: unlike a single chat turn's actions,
// this is read from the DB-backed log directly (`list_ai_actions`), so it
// still shows (and can still revert) actions from before a "New
// conversation" reset or a previous app run — see
// `AIChatOrchestrator::reset`'s doc comment.
export function useAiActionLog(onMutation?: () => void) {
  const [actions, setActions] = useState<AiActionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<AiActionLogEntry[]>("list_ai_actions");
      setActions(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function revert(actionId: string, force = false) {
    try {
      const outcome = await invoke<RevertOutcome>("revert_ai_action", {
        id: actionId,
        force,
      });

      if (outcome.status === "needs_confirmation") {
        const confirmed = await confirm(
          "This task has been updated since this action was taken. Reverting will overwrite those later changes.",
          { title: "Task changed since this action?", kind: "warning" },
        );
        if (confirmed) await revert(actionId, true);
        return;
      }

      // Flip the button off immediately rather than waiting on a refetch —
      // the exact timestamp value doesn't matter, only that it's truthy.
      const revertedAt = new Date().toISOString();
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId ? { ...a, reverted_at: revertedAt } : a,
        ),
      );
      onMutation?.();
    } catch (err) {
      setError(String(err));
    }
  }

  return { actions, loading, error, refresh, revert };
}
