import { useEffect, useRef, useState } from "react";
import { Loader2Icon, PlusIcon, SendIcon, SettingsIcon } from "lucide-react";
import { useAIChat } from "@/hooks/useAIChat";
import { useSettings } from "@/hooks/useSettings";
import { AIConnectionDialog } from "@/components/AIConnectionDialog";
import { AiActionsPanel } from "@/components/AiActionsPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 384;
const WIDTH_STORAGE_KEY = "kankouin.aiSidebar.width";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getStoredWidth() {
  const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed)
    ? clamp(parsed, MIN_WIDTH, MAX_WIDTH)
    : DEFAULT_WIDTH;
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
  const { messages, sendMessage, loading, error, resetConversation } =
    useAIChat(projectId, workspaceId, projectName, workspaceName, onMutation);
  const {
    settings,
    defaultAiSystemPrompt,
    setAiConnection,
    clearAiConnection,
    setAiSystemPrompt,
  } = useSettings();
  const [draft, setDraft] = useState("");
  const [width, setWidth] = useState(getStoredWidth);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

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

  // The panel is pinned to the right edge of the window, so its width is
  // just the distance from the pointer to that edge — no need to track
  // drag deltas relative to the handle's starting position.
  useEffect(() => {
    if (!isResizing) return;

    function handlePointerMove(e: PointerEvent) {
      setWidth(clamp(window.innerWidth - e.clientX, MIN_WIDTH, MAX_WIDTH));
    }
    function handlePointerUp() {
      setIsResizing(false);
      localStorage.setItem(WIDTH_STORAGE_KEY, String(widthRef.current));
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing]);

  return (
    <aside
      style={{ width: open ? width : 0 }}
      className={cn(
        "flex h-screen shrink-0 overflow-hidden border-l bg-muted/20",
        !isResizing && "transition-[width]",
      )}
    >
      {open && (
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/50 active:bg-primary/70"
        />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
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
              systemPrompt={settings.ai_system_prompt}
              defaultSystemPrompt={defaultAiSystemPrompt}
              onSaveSystemPrompt={setAiSystemPrompt}
            />
          </div>
        </div>

        <Tabs defaultValue="chat" className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="gap-3">
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
                <p className="flex items-center gap-2 self-start text-sm text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" />
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
          </TabsContent>

          <TabsContent value="actions">
            <AiActionsPanel onMutation={onMutation} />
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}
