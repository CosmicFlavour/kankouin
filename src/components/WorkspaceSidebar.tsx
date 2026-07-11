import { PlusIcon } from "lucide-react";
import type { Workspace } from "@/hooks/useWorkspaces";
import { NameDialog } from "@/components/NameDialog";
import { WorkspaceTreeItem } from "@/components/WorkspaceTreeItem";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SyncPanel } from "@/components/SyncPanel";

interface WorkspaceSidebarProps {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  onCreateWorkspace: (name: string) => Promise<void>;
  selectedWorkspaceId: string | null;
  selectedProjectId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectProject: (workspaceId: string, projectId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  showToday: boolean;
  onSelectToday: () => void;
  staleCount: number;
  onOpenDailyReview: () => void;
  projectsVersion: number;
}

export function WorkspaceSidebar({
  workspaces,
  loading,
  error,
  onCreateWorkspace,
  selectedWorkspaceId,
  selectedProjectId,
  onSelectWorkspace,
  onSelectProject,
  onDeleteWorkspace,
  showToday,
  onSelectToday,
  staleCount,
  onOpenDailyReview,
  projectsVersion,
}: WorkspaceSidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Kankouin</h1>
        <ThemeToggle />
      </div>

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
        <button
          type="button"
          onClick={onOpenDailyReview}
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
        >
          Daily Review
          {staleCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs text-foreground">
              {staleCount}
            </span>
          )}
        </button>
      </nav>

      <div className="mt-4 flex items-center justify-between px-1">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Workspaces
        </h2>
        <NameDialog
          trigger={
            <Button type="button" variant="ghost" size="icon-sm">
              <PlusIcon />
              <span className="sr-only">New workspace</span>
            </Button>
          }
          title="New workspace"
          placeholder="Workspace name"
          submitLabel="Create workspace"
          onSubmit={onCreateWorkspace}
        />
      </div>

      <nav className="mt-1 flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {loading && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            Loading...
          </p>
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
          <WorkspaceTreeItem
            key={workspace.id}
            workspace={workspace}
            isSelected={!showToday && workspace.id === selectedWorkspaceId}
            selectedProjectId={showToday ? null : selectedProjectId}
            onSelectWorkspace={() => onSelectWorkspace(workspace.id)}
            onSelectProject={(projectId) =>
              onSelectProject(workspace.id, projectId)
            }
            onDeleteWorkspace={onDeleteWorkspace}
            projectsVersion={projectsVersion}
          />
        ))}
      </nav>

      <SyncPanel />
    </aside>
  );
}
