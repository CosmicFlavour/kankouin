import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// The backend also returns `actions` (the turn's logged tool calls), but
// nothing here needs it — the Actions tab reads the DB-backed log directly
// via `useAiActionLog` instead, so it isn't scoped to the current
// in-memory conversation. See that hook's doc comment.
interface ChatTurnResult {
  reply: string;
}

let nextId = 0;
function makeId() {
  nextId += 1;
  return `msg-${nextId}`;
}

// `onMutation` fires after every turn, success or failure — not just ones
// that actually changed data, and not just ones that didn't error. The
// backend doesn't report which tools (if any) a turn invoked, and a tool
// call can mutate the db and then have a *later* step in the same turn
// fail (a follow-up provider call, another tool call, the iteration cap —
// see orchestrator.rs's send_message), so "it errored" is never proof
// nothing happened. Always refetching is the simplest thing that's always
// correct. It's how the task board (via App.tsx's aiRefreshSignal ->
// useTasks's refreshKey) picks up AI-driven changes without a shared cache.
export function useAIChat(
  projectId: string | null,
  workspaceId: string | null,
  projectName: string | null,
  workspaceName: string | null,
  onMutation?: () => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", content: trimmed },
    ]);
    setLoading(true);
    setError(null);

    try {
      const result = await invoke<ChatTurnResult>("chat_with_ai", {
        message: trimmed,
        projectId,
        workspaceId,
        projectName,
        workspaceName,
      });
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: result.reply },
      ]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      onMutation?.();
    }
  }

  // The "New conversation" button. Only clears the local transcript and
  // the backend's in-memory history — the DB-backed action log (and thus
  // revert-ability) is untouched, see reset_ai_conversation.
  async function resetConversation() {
    try {
      await invoke("reset_ai_conversation");
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  return {
    messages,
    sendMessage,
    loading,
    error,
    resetConversation,
  };
}
