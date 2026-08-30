import { useState } from "react";
import { SendIcon, SettingsIcon } from "lucide-react";
import { useAIChat } from "@/hooks/useAIChat";
import { useSettings } from "@/hooks/useSettings";
import { AIConnectionDialog } from "@/components/AIConnectionDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AIChatSidebarProps {
  open: boolean;
  projectId: string | null;
  workspaceId: string | null;
  onMutation: () => void;
}

// Kept mounted (width-collapsed, not conditionally rendered) so the
// conversation survives toggling the sidebar closed and back open within
// the session — matches the roadmap's "persistent AIChatSidebar".
export function AIChatSidebar({
  open,
  projectId,
  workspaceId,
  onMutation,
}: AIChatSidebarProps) {
  const { messages, sendMessage, loading, error } = useAIChat(
    projectId,
    workspaceId,
    onMutation,
  );
  const { settings, setAiConnection, clearAiConnection } = useSettings();
  const [draft, setDraft] = useState("");

  async function handleSend() {
    if (!draft.trim() || loading) return;
    const text = draft;
    setDraft("");
    await sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col overflow-hidden border-l bg-muted/20 transition-[width]",
        open ? "w-96" : "w-0",
      )}
    >
      <div className="flex min-w-96 flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">AI Assistant</h2>
          <AIConnectionDialog
            trigger={
              <Button type="button" variant="ghost" size="icon-sm">
                <SettingsIcon />
                <span className="sr-only">AI connection settings</span>
              </Button>
            }
            connection={settings.ai_connection}
            onSave={setAiConnection}
            onClear={clearAiConnection}
          />
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ask me to break a task down, create tasks, or organize your
              board.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                message.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-muted text-foreground",
              )}
            >
              {message.content}
            </div>
          ))}
          {loading && (
            <p className="self-start text-sm text-muted-foreground">
              Thinking…
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the AI assistant…"
            disabled={loading}
            className="min-h-9"
          />
          <Button
            type="button"
            size="icon"
            aria-label="Send message"
            onClick={handleSend}
            disabled={loading || !draft.trim()}
          >
            <SendIcon />
          </Button>
        </div>
      </div>
    </aside>
  );
}
