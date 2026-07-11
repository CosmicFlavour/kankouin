import { useEffect, useState } from "react";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useStaleTasks } from "@/hooks/useStaleTasks";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProjectPanel } from "@/components/ProjectPanel";
import { TodayView } from "@/components/TodayView";
import { DailyReviewDialog } from "@/components/DailyReviewDialog";

function App() {
  const { workspaces, loading, error, createWorkspace, deleteWorkspace } =
    useWorkspaces();
  const { tasks: staleTasks, loading: staleLoading, refresh: refreshStale } =
    useStaleTasks();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [showToday, setShowToday] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [dailyReviewOpen, setDailyReviewOpen] = useState(false);
  const [autoOpenedReview, setAutoOpenedReview] = useState(false);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  useEffect(() => {
    if (!autoOpenedReview && !staleLoading && staleTasks.length > 0) {
      setDailyReviewOpen(true);
      setAutoOpenedReview(true);
    }
  }, [autoOpenedReview, staleLoading, staleTasks]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <WorkspaceSidebar
        workspaces={workspaces}
        loading={loading}
        error={error}
        onCreateWorkspace={createWorkspace}
        selectedWorkspaceId={selectedWorkspaceId}
        selectedProjectId={selectedProjectId}
        onSelectWorkspace={(workspaceId) => {
          setShowToday(false);
          setSelectedWorkspaceId(workspaceId);
          setSelectedProjectId(null);
        }}
        onSelectProject={(workspaceId, projectId) => {
          setShowToday(false);
          setSelectedWorkspaceId(workspaceId);
          setSelectedProjectId(projectId);
        }}
        onDeleteWorkspace={async (workspaceId) => {
          await deleteWorkspace(workspaceId);
          if (workspaceId === selectedWorkspaceId) {
            setSelectedWorkspaceId(null);
            setSelectedProjectId(null);
          }
        }}
        showToday={showToday}
        onSelectToday={() => setShowToday(true)}
        staleCount={staleTasks.length}
        onOpenDailyReview={() => setDailyReviewOpen(true)}
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
        {!showToday && selectedWorkspace && !selectedProjectId && (
          <p className="m-auto text-muted-foreground">
            Select a project to get started
          </p>
        )}
        {!showToday && selectedWorkspace && selectedProjectId && (
          <ProjectPanel
            workspace={selectedWorkspace}
            projectId={selectedProjectId}
            focusTaskId={focusTaskId}
            onFocusHandled={() => setFocusTaskId(null)}
            onArchived={() => setSelectedProjectId(null)}
          />
        )}
      </main>

      <DailyReviewDialog
        open={dailyReviewOpen}
        onOpenChange={setDailyReviewOpen}
        tasks={staleTasks}
        onFinished={refreshStale}
      />
    </div>
  );
}

export default App;
