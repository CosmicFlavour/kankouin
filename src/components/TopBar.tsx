import { useEffect, useRef, useState } from "react";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import type { Workspace } from "@/hooks/useWorkspaces";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// How long to wait after the pointer leaves the switcher (trigger or
// content) before closing it — long enough to cross the gap between the
// two without the popover flickering shut, short enough not to feel
// sticky.
const HOVER_CLOSE_DELAY_MS = 200;

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
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  function cancelScheduledClose() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  function openSwitcher() {
    cancelScheduledClose();
    setSwitcherOpen(true);
  }

  function scheduleCloseSwitcher() {
    cancelScheduledClose();
    closeTimeoutRef.current = setTimeout(
      () => setSwitcherOpen(false),
      HOVER_CLOSE_DELAY_MS,
    );
  }

  const breadcrumbLabel = selectedProjectName
    ? `${selectedWorkspaceName} / ${selectedProjectName}`
    : (selectedWorkspaceName ?? "Select a workspace");

  // Jumps straight back to whatever project/workspace was last selected,
  // reusing the same handlers the switcher itself uses — picking the same
  // id again is a no-op except for the activeView flip back to "workspace".
  function navigateToLastSelection() {
    if (selectedWorkspaceId && selectedProjectId) {
      onSelectProject(selectedWorkspaceId, selectedProjectId);
    } else if (selectedWorkspaceId) {
      onSelectWorkspace(selectedWorkspaceId);
    } else {
      // Nothing to return to yet — click behaves like opening the switcher.
      // Ensure-open, not toggle: a real mouse click always lands after a
      // mouseenter already opened it (userEvent and real browsers both fire
      // mouseenter before click), so toggling would immediately re-close
      // what hover just opened.
      openSwitcher();
      return;
    }
    setSwitcherOpen(false);
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <img src="/logo.png" alt="" className="size-6 rounded-md" />
      <h1 className="mr-1 text-sm font-semibold">Kankouin</h1>

      <div className="mx-1 h-5 w-px bg-border" />

      <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            className={cn(
              "flex items-center overflow-hidden rounded-md border border-border",
              activeView === "workspace" && "border-accent-foreground/20 bg-accent",
            )}
            onMouseEnter={openSwitcher}
            onMouseLeave={scheduleCloseSwitcher}
          >
            <button
              type="button"
              onClick={navigateToLastSelection}
              title={
                selectedWorkspaceId
                  ? "Go to the current project"
                  : "Select a workspace"
              }
              className={cn(
                "px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted",
                activeView === "workspace" && "text-foreground hover:bg-transparent",
              )}
            >
              {breadcrumbLabel}
            </button>
            <button
              type="button"
              onClick={openSwitcher}
              title="Switch workspace or project"
              className={cn(
                "border-l border-border px-1.5 py-1 text-muted-foreground hover:bg-muted",
                activeView === "workspace" && "text-foreground hover:bg-transparent",
              )}
            >
              <ChevronDownIcon className="size-3.5" />
              <span className="sr-only">Switch workspace or project</span>
            </button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-auto p-2"
          onMouseEnter={openSwitcher}
          onMouseLeave={scheduleCloseSwitcher}
          onPointerDownOutside={(event) => {
            // Hovering already opens the content before a click's own
            // pointerdown fires, so without this, Radix's outside-click
            // detection sees that pointerdown landing on the trigger (now
            // "outside" the already-open content) and auto-dismisses right
            // before the click handler runs. Ignore pointerdowns that
            // originate from the trigger itself — it already has its own
            // click handling.
            if (anchorRef.current?.contains(event.target as Node)) {
              event.preventDefault();
            }
          }}
        >
          <ProjectSwitcher
            workspaces={workspaces}
            loading={loading}
            error={error}
            onCreateWorkspace={onCreateWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            selectedProjectId={selectedProjectId}
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
