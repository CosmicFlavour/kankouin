import { useState } from "react";
import type { Workspace } from "@/hooks/useWorkspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SyncPanel } from "@/components/SyncPanel";

interface WorkspaceSidebarProps {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  onCreate: (name: string) => Promise<void>;
  selectedWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  showToday: boolean;
  onSelectToday: () => void;
}

export function WorkspaceSidebar({
  workspaces,
  loading,
  error,
  onCreate,
  selectedWorkspaceId,
  onSelect,
  showToday,
  onSelectToday,
}: WorkspaceSidebarProps) {
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onCreate(name.trim());
      setName("");
      setCreateError(null);
    } catch (err) {
      setCreateError(String(err));
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border p-4">
      <h1 className="text-lg font-semibold">Kankouin</h1>
      <nav className="mt-6 flex flex-col gap-1">
        <button
          type="button"
          onClick={onSelectToday}
          className={cn(
            "rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted",
            showToday && "bg-accent text-foreground",
          )}
        >
          Today / This Week
        </button>
        {loading && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</p>
        )}
        {error && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            Couldn't load workspaces: {error}
          </p>
        )}
        {!loading && !error && workspaces.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No workspaces yet
          </p>
        )}
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onSelect(workspace.id)}
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted",
              workspace.id === selectedWorkspaceId && "bg-accent text-foreground",
            )}
          >
            {workspace.name}
          </button>
        ))}
      </nav>

      <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New workspace name"
        />
        <Button type="submit">Create workspace</Button>
        {createError && <p className="text-sm text-destructive">{createError}</p>}
      </form>

      <SyncPanel />
    </aside>
  );
}
