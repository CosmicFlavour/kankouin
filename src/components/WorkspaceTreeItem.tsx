import { useState } from "react";
import { ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useProjects } from "@/hooks/useProjects";
import { useArchivedProjects } from "@/hooks/useArchivedProjects";
import type { Workspace } from "@/hooks/useWorkspaces";
import { NameDialog } from "@/components/NameDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";

interface WorkspaceTreeItemProps {
  workspace: Workspace;
  isSelected: boolean;
  selectedProjectId: string | null;
  onSelectWorkspace: () => void;
  onSelectProject: (projectId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  projectsVersion: number;
}

export function WorkspaceTreeItem({
  workspace,
  isSelected,
  selectedProjectId,
  onSelectWorkspace,
  onSelectProject,
  onDeleteWorkspace,
  projectsVersion,
}: WorkspaceTreeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { projects, loading, error, createProject } = useProjects(
    workspace.id,
    projectsVersion,
  );
  const {
    archivedProjects,
    loading: archivedLoading,
    error: archivedError,
  } = useArchivedProjects(archivedOpen ? workspace.id : null);

  async function handleDelete() {
    setDeleteError(null);
    const confirmed = await confirm(
      `Delete "${workspace.name}" and everything in it? This permanently deletes all its projects, epics, stories and tasks. This can't be undone.`,
      { title: "Delete workspace?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await onDeleteWorkspace(workspace.id);
      toast({ title: "Workspace deleted", description: workspace.name });
    } catch (err) {
      setDeleteError(String(err));
    }
  }

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1 hover:bg-muted",
          isSelected && !selectedProjectId && "bg-accent",
        )}
      >
        <button
          type="button"
          onClick={() => {
            setExpanded((prev) => !prev);
            onSelectWorkspace();
          }}
          className={cn(
            "flex flex-1 items-center gap-1 px-1 py-1.5 text-left text-sm text-muted-foreground",
            isSelected && !selectedProjectId && "text-foreground",
          )}
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
          />
          {workspace.name}
        </button>
        <NameDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100"
            >
              <PlusIcon />
              <span className="sr-only">New project</span>
            </Button>
          }
          title={`New project in ${workspace.name}`}
          placeholder="Project name"
          submitLabel="Create project"
          onSubmit={createProject}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100"
          onClick={handleDelete}
        >
          <Trash2Icon />
          <span className="sr-only">Delete workspace</span>
        </Button>
      </div>
      {deleteError && (
        <p className="px-2 text-xs text-destructive">{deleteError}</p>
      )}

      {expanded && (
        <div className="ml-4 flex flex-col gap-0.5">
          {loading && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Loading...
            </p>
          )}
          {error && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Couldn't load: {error}
            </p>
          )}
          {!loading && !error && projects.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              No projects yet
            </p>
          )}
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject(project.id)}
              className={cn(
                "rounded-md px-2 py-1 text-left text-sm text-muted-foreground hover:bg-muted",
                project.id === selectedProjectId && "bg-accent text-foreground",
              )}
            >
              {project.name}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setArchivedOpen((prev) => !prev)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
          >
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 transition-transform",
                archivedOpen && "rotate-90",
              )}
            />
            Archived
          </button>
          {archivedOpen && (
            <div className="ml-4 flex flex-col gap-0.5">
              {archivedLoading && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Loading...
                </p>
              )}
              {archivedError && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Couldn't load: {archivedError}
                </p>
              )}
              {!archivedLoading &&
                !archivedError &&
                archivedProjects.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    No archived projects
                  </p>
                )}
              {archivedProjects.map((project) => (
                <p
                  key={project.id}
                  className="px-2 py-1 text-xs text-muted-foreground"
                >
                  {project.name}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
