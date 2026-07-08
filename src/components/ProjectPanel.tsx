import { useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import type { Workspace } from "@/hooks/useWorkspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TaskBoard } from "@/components/TaskBoard";

interface ProjectPanelProps {
  workspace: Workspace;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
}

export function ProjectPanel({
  workspace,
  selectedProjectId,
  onSelectProject,
}: ProjectPanelProps) {
  const { projects, loading, error, createProject } = useProjects(workspace.id);
  const [projectName, setProjectName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    try {
      await createProject(projectName.trim());
      setProjectName("");
      setCreateError(null);
    } catch (err) {
      setCreateError(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{workspace.name}</h2>

      <div className="flex flex-col gap-1">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {error && (
          <p className="text-sm text-muted-foreground">
            Couldn't load projects: {error}
          </p>
        )}
        {!loading && !error && projects.length === 0 && (
          <p className="text-sm text-muted-foreground">No projects yet</p>
        )}
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className={cn(
              "rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted",
              project.id === selectedProjectId && "bg-accent",
            )}
          >
            {project.name}
          </button>
        ))}
      </div>

      <form onSubmit={handleCreate} className="flex max-w-sm flex-col gap-2">
        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="New project name"
        />
        <Button type="submit">Create project</Button>
        {createError && <p className="text-sm text-destructive">{createError}</p>}
      </form>

      {selectedProject && (
        <TaskBoard projectId={selectedProject.id} workspaceId={workspace.id} />
      )}
    </div>
  );
}
