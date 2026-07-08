import { useState } from "react";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProjectPanel } from "@/components/ProjectPanel";
import { TodayView } from "@/components/TodayView";

function App() {
  const { workspaces, loading, error, createWorkspace } = useWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [showToday, setShowToday] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <WorkspaceSidebar
        workspaces={workspaces}
        loading={loading}
        error={error}
        onCreate={createWorkspace}
        selectedWorkspaceId={showToday ? null : selectedWorkspaceId}
        onSelect={(workspaceId) => {
          setShowToday(false);
          setSelectedWorkspaceId(workspaceId);
          setSelectedProjectId(null);
        }}
        showToday={showToday}
        onSelectToday={() => setShowToday(true)}
      />
      <main className="flex flex-1 flex-col p-6">
        {showToday && (
          <TodayView
            onNavigate={(workspaceId, projectId, taskId) => {
              setShowToday(false);
              setSelectedWorkspaceId(workspaceId);
              setSelectedProjectId(projectId);
              setFocusTaskId(taskId);
            }}
          />
        )}
        {!showToday && !selectedWorkspace && (
          <p className="m-auto text-muted-foreground">
            Select a workspace to get started
          </p>
        )}
        {!showToday && selectedWorkspace && (
          <ProjectPanel
            workspace={selectedWorkspace}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            focusTaskId={focusTaskId}
            onFocusHandled={() => setFocusTaskId(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
