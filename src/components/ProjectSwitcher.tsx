import type { Workspace } from "@/hooks/useWorkspaces";
import { NameDialog } from "@/components/NameDialog";
import { WorkspaceTreeItem } from "@/components/WorkspaceTreeItem";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

interface ProjectSwitcherProps {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  onCreateWorkspace: (name: string) => Promise<void>;
  selectedWorkspaceId: string | null;
  selectedProjectId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectProject: (workspaceId: string, projectId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onRenameWorkspace: (workspaceId: string, name: string) => Promise<unknown>;
  onProjectsChanged?: () => void;
  projectsVersion: number;
}

// Popover content for the top bar's workspace/project breadcrumb button —
// the same workspace -> project tree the old sidebar showed permanently
// pinned, just relocated behind a click. See TopBar.tsx for the trigger.
export function ProjectSwitcher({
  workspaces,
  loading,
  error,
  onCreateWorkspace,
  selectedWorkspaceId,
  selectedProjectId,
  onSelectWorkspace,
  onSelectProject,
  onDeleteWorkspace,
  onRenameWorkspace,
  onProjectsChanged,
  projectsVersion,
}: ProjectSwitcherProps) {
  return (
    <div className="flex max-h-[70vh] w-72 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
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

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
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
            isSelected={workspace.id === selectedWorkspaceId}
            selectedProjectId={selectedProjectId}
            onSelectWorkspace={() => onSelectWorkspace(workspace.id)}
            onSelectProject={(projectId) =>
              onSelectProject(workspace.id, projectId)
            }
            onDeleteWorkspace={onDeleteWorkspace}
            onRenameWorkspace={onRenameWorkspace}
            onProjectsChanged={onProjectsChanged}
            projectsVersion={projectsVersion}
          />
        ))}
      </div>
    </div>
  );
}
