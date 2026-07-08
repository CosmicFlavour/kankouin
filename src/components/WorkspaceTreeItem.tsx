import { useState } from "react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import type { Workspace } from "@/hooks/useWorkspaces";
import { NameDialog } from "@/components/NameDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkspaceTreeItemProps {
  workspace: Workspace;
  isSelected: boolean;
  selectedProjectId: string | null;
  onSelectWorkspace: () => void;
  onSelectProject: (projectId: string) => void;
}

export function WorkspaceTreeItem({
  workspace,
  isSelected,
  selectedProjectId,
  onSelectWorkspace,
  onSelectProject,
}: WorkspaceTreeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const { projects, loading, error, createProject } = useProjects(
    workspace.id,
  );

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
      </div>

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
        </div>
      )}
    </div>
  );
}
