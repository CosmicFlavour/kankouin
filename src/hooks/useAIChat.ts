import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let nextId = 0;
function makeId() {
  nextId += 1;
  return `msg-${nextId}`;
}

// `onMutation` fires on every successful reply, not just ones that actually
// changed data — the backend doesn't report which tools (if any) a turn
// invoked, so this is the simplest thing that's always correct. It's how
// the task board (via App.tsx's aiRefreshSignal -> useTasks's refreshKey)
// picks up AI-driven changes without a shared cache.
export function useAIChat(
  projectId: string | null,
  workspaceId: string | null,
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
      const reply = await invoke<string>("chat_with_ai", {
        message: trimmed,
        projectId,
        workspaceId,
      });
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: reply },
      ]);
      onMutation?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return { messages, sendMessage, loading, error };
}
