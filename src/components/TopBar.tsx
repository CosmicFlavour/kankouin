import { useState } from "react";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import type { Workspace } from "@/hooks/useWorkspaces";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TopBarProps {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  onCreateWorkspace: (name: string) => Promise<void>;
  selectedWorkspaceId: string | null;
  selectedWorkspaceName: string | null;
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectProject: (workspaceId: string, projectId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onRenameWorkspace: (workspaceId: string, name: string) => Promise<unknown>;
  onProjectsChanged?: () => void;
  projectsVersion: number;
  activeView: "workspace" | "today" | "tags" | "search";
  onSelectToday: () => void;
  onSelectTags: () => void;
  onSelectSearch: () => void;
  staleCount: number;
  onOpenDailyReview: () => void;
  aiSidebarOpen: boolean;
  onToggleAiSidebar: () => void;
}

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Replaces the old pinned left sidebar: a full-width bar so every view
// below it can be truly centered against the whole window, not just the
// space left over after a fixed-width rail. The workspace/project tree
// that used to sit permanently visible now lives in the ProjectSwitcher
// popover — same tree component, same rename/create/delete/archived
// behavior, just a click away instead of always pinned.
export function TopBar({
  workspaces,
  loading,
  error,
  onCreateWorkspace,
  selectedWorkspaceId,
  selectedWorkspaceName,
  selectedProjectId,
  selectedProjectName,
  onSelectWorkspace,
  onSelectProject,
  onDeleteWorkspace,
  onRenameWorkspace,
  onProjectsChanged,
  projectsVersion,
  activeView,
  onSelectToday,
  onSelectTags,
  onSelectSearch,
  staleCount,
  onOpenDailyReview,
  aiSidebarOpen,
  onToggleAiSidebar,
}: TopBarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const breadcrumbLabel = selectedProjectName
    ? `${selectedWorkspaceName} / ${selectedProjectName}`
    : (selectedWorkspaceName ?? "Select a workspace");

  // The old sidebar only highlighted the tree's selection while the
  // "workspace" view was active — preserved here so switching to Today or
  // Search doesn't leave a stale project looking selected in the popover.
  const gatedWorkspaceId = activeView === "workspace" ? selectedWorkspaceId : null;
  const gatedProjectId = activeView === "workspace" ? selectedProjectId : null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <img src="/logo.png" alt="" className="size-6 rounded-md" />
      <h1 className="mr-1 text-sm font-semibold">Kankouin</h1>

      <div className="mx-1 h-5 w-px bg-border" />

      <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "gap-1 font-normal text-muted-foreground",
              activeView === "workspace" && "text-foreground",
            )}
          >
            {breadcrumbLabel}
            <ChevronDownIcon className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <ProjectSwitcher
            workspaces={workspaces}
            loading={loading}
            error={error}
            onCreateWorkspace={onCreateWorkspace}
            selectedWorkspaceId={gatedWorkspaceId}
            selectedProjectId={gatedProjectId}
            onSelectWorkspace={onSelectWorkspace}
            onSelectProject={(workspaceId, projectId) => {
              onSelectProject(workspaceId, projectId);
              setSwitcherOpen(false);
            }}
            onDeleteWorkspace={onDeleteWorkspace}
            onRenameWorkspace={onRenameWorkspace}
            onProjectsChanged={onProjectsChanged}
            projectsVersion={projectsVersion}
          />
        </PopoverContent>
      </Popover>

      <nav className="ml-2 flex items-center gap-1">
        <NavTab active={activeView === "today"} onClick={onSelectToday}>
          Today / This Week
        </NavTab>
        <NavTab active={activeView === "search"} onClick={onSelectSearch}>
          Search
        </NavTab>
        <NavTab active={activeView === "tags"} onClick={onSelectTags}>
          Tags
        </NavTab>
        <NavTab active={false} onClick={onOpenDailyReview}>
          Daily Review
          {staleCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs text-foreground">
              {staleCount}
            </span>
          )}
        </NavTab>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant={aiSidebarOpen ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onToggleAiSidebar}
        >
          <BotIcon />
          <span className="sr-only">Toggle AI assistant</span>
        </Button>
        <SettingsDialog />
        <ThemeToggle />
      </div>
    </header>
  );
}
