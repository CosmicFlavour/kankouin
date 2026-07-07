import { useState } from "react";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProjectPanel } from "@/components/ProjectPanel";

function App() {
  const { workspaces, loading, error, createWorkspace } = useWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <WorkspaceSidebar
        workspaces={workspaces}
        loading={loading}
        error={error}
        onCreate={createWorkspace}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelect={(workspaceId) => {
          setSelectedWorkspaceId(workspaceId);
          setSelectedProjectId(null);
        }}
      />
      <main className="flex flex-1 flex-col p-6">
        {!selectedWorkspace && (
          <p className="m-auto text-muted-foreground">
            Select a workspace to get started
          </p>
        )}
        {selectedWorkspace && (
          <ProjectPanel
            workspace={selectedWorkspace}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
