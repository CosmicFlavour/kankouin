import { Fragment, useState } from "react";
import { PlusIcon, SendIcon, SettingsIcon } from "lucide-react";
import { useAIChat, type AiActionLogEntry } from "@/hooks/useAIChat";
import { useSettings } from "@/hooks/useSettings";
import { AIConnectionDialog } from "@/components/AIConnectionDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AIChatSidebarProps {
  open: boolean;
  projectId: string | null;
  workspaceId: string | null;
  projectName: string | null;
  workspaceName: string | null;
  onMutation: () => void;
}

function ActionsTrail({
  actions,
  onRevert,
}: {
  actions: AiActionLogEntry[];
  onRevert: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full max-w-[85%] self-start text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        {actions.length} action{actions.length === 1 ? "" : "s"} taken
      </button>
      {expanded && (
        <ul className="mt-1 flex flex-col gap-1">
          {actions.map((action) => (
            <li key={action.id} className="flex items-center justify-between gap-2">
              <span className={action.reverted_at ? "line-through" : undefined}>
                {action.summary}
              </span>
              {action.revertible && !action.reverted_at && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onRevert(action.id)}
                >
                  Revert
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Kept mounted (width-collapsed, not conditionally rendered) so the
// conversation survives toggling the sidebar closed and back open within
// the session — matches the roadmap's "persistent AIChatSidebar".
export function AIChatSidebar({
  open,
  projectId,
  workspaceId,
  projectName,
  workspaceName,
  onMutation,
}: AIChatSidebarProps) {
  const {
    messages,
    sendMessage,
    loading,
    error,
    resetConversation,
    revertAction,
  } = useAIChat(projectId, workspaceId, projectName, workspaceName, onMutation);
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
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={resetConversation}
              title="New conversation"
            >
              <PlusIcon />
              <span className="sr-only">New conversation</span>
            </Button>
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
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ask me to break a task down, create tasks, or organize your
              board.
            </p>
          )}
          {messages.map((message) => (
            <Fragment key={message.id}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-muted text-foreground",
                )}
              >
                {message.content}
              </div>
              {message.role === "assistant" &&
                message.actions &&
                message.actions.length > 0 && (
                  <ActionsTrail actions={message.actions} onRevert={revertAction} />
                )}
            </Fragment>
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
