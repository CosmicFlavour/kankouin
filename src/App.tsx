import { useState } from "react";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function App() {
  const { workspaces, loading, error, createWorkspace } = useWorkspaces();
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

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
            <div
              key={workspace.id}
              className="rounded-md px-2 py-1.5 text-sm text-muted-foreground"
            >
              {workspace.name}
            </div>
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
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Select a workspace to get started</p>
      </main>
    </div>
  );
}

export default App;
