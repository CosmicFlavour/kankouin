import { useState } from "react";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function App() {
  const { workspaces, loading, error, createWorkspace } = useWorkspaces();
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createWorkspace(name.trim());
      setName("");
      setCreateError(null);
    } catch (err) {
      setCreateError(String(err));
    }
  }

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  const {
    projects,
    loading: projectsLoading,
    error: projectsError,
    createProject,
  } = useProjects(selectedWorkspaceId);
  const [projectName, setProjectName] = useState("");
  const [createProjectError, setCreateProjectError] = useState<string | null>(
    null,
  );

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    try {
      await createProject(projectName.trim());
      setProjectName("");
      setCreateProjectError(null);
    } catch (err) {
      setCreateProjectError(String(err));
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border p-4">
        <h1 className="text-lg font-semibold">Kankouin</h1>
        <nav className="mt-6 flex flex-col gap-1">
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
              onClick={() => setSelectedWorkspaceId(workspace.id)}
              className={cn(
                "rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted",
                workspace.id === selectedWorkspaceId &&
                  "bg-accent text-foreground",
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
          {createError && (
            <p className="text-sm text-destructive">{createError}</p>
          )}
        </form>
      </aside>
      <main className="flex flex-1 flex-col p-6">
        {!selectedWorkspace && (
          <p className="m-auto text-muted-foreground">
            Select a workspace to get started
          </p>
        )}
        {selectedWorkspace && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>

            <div className="flex flex-col gap-1">
              {projectsLoading && (
                <p className="text-sm text-muted-foreground">Loading...</p>
              )}
              {projectsError && (
                <p className="text-sm text-muted-foreground">
                  Couldn't load projects: {projectsError}
                </p>
              )}
              {!projectsLoading && !projectsError && projects.length === 0 && (
                <p className="text-sm text-muted-foreground">No projects yet</p>
              )}
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  {project.name}
                </div>
              ))}
            </div>

            <form
              onSubmit={handleCreateProject}
              className="flex max-w-sm flex-col gap-2"
            >
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="New project name"
              />
              <Button type="submit">Create project</Button>
              {createProjectError && (
                <p className="text-sm text-destructive">{createProjectError}</p>
              )}
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
