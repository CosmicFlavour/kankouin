import { useEffect, useState } from "react";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useStaleTasks } from "@/hooks/useStaleTasks";
import { useDatabaseStatus } from "@/hooks/useDatabaseStatus";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProjectPanel } from "@/components/ProjectPanel";
import { TodayView } from "@/components/TodayView";
import { TagsView } from "@/components/TagsView";
import { SearchView } from "@/components/SearchView";
import { DailyReviewDialog } from "@/components/DailyReviewDialog";
import { DatabaseSetupScreen } from "@/components/DatabaseSetupScreen";
import { Toaster } from "@/components/Toaster";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Daily Review should auto-open at most once per calendar day. Stored in
// localStorage (not component state) so it survives closing and reopening
// the app, not just re-renders within a single session.
const DAILY_REVIEW_LAST_SHOWN_KEY = "kankouin.dailyReview.lastAutoOpenedDate";

function App() {
  const {
    status: dbStatus,
    loading: dbStatusLoading,
    createDatabaseFile,
    openDatabaseFile,
  } = useDatabaseStatus();
  const {
    workspaces,
    loading,
    error,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  } = useWorkspaces();
  const { tasks: staleTasks, loading: staleLoading, refresh: refreshStale } =
    useStaleTasks();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [activeView, setActiveView] = useState<
    "workspace" | "today" | "tags" | "search"
  >("workspace");
  const [dailyReviewOpen, setDailyReviewOpen] = useState(false);
  // ProjectPanel and the sidebar tree each hold their own useProjects
  // instance with no shared cache; bumping this forces both to re-fetch so
  // archiving from one is reflected in the other (see useProjects.ts).
  const [projectsVersion, setProjectsVersion] = useState(0);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  useEffect(() => {
    if (staleLoading || staleTasks.length === 0) return;
    const today = new Date().toDateString();
    if (localStorage.getItem(DAILY_REVIEW_LAST_SHOWN_KEY) === today) return;
    localStorage.setItem(DAILY_REVIEW_LAST_SHOWN_KEY, today);
    setDailyReviewOpen(true);
  }, [staleLoading, staleTasks]);

  if (dbStatusLoading || !dbStatus) {
    return null;
  }

  if (dbStatus.status !== "ok") {
    return (
      <>
        <DatabaseSetupScreen
          status={dbStatus}
          onCreateDatabaseFile={createDatabaseFile}
          onOpenDatabaseFile={openDatabaseFile}
        />
        <Toaster />
        <ConfirmDialog />
      </>
    );
  }

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
          setActiveView("workspace");
          setSelectedWorkspaceId(workspaceId);
          setSelectedProjectId(null);
        }}
        onSelectProject={(workspaceId, projectId) => {
          setActiveView("workspace");
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
        onRenameWorkspace={updateWorkspace}
        onProjectsChanged={() => setProjectsVersion((v) => v + 1)}
        activeView={activeView}
        onSelectToday={() => setActiveView("today")}
        onSelectTags={() => setActiveView("tags")}
        onSelectSearch={() => setActiveView("search")}
        staleCount={staleTasks.length}
        onOpenDailyReview={() => setDailyReviewOpen(true)}
        projectsVersion={projectsVersion}
      />
      <main className="flex flex-1 flex-col p-6">
        {activeView === "today" && <TodayView />}
        {activeView === "tags" && <TagsView />}
        {activeView === "search" && <SearchView />}
        {activeView === "workspace" && !selectedWorkspace && (
          <p className="m-auto text-muted-foreground">
            Select a workspace to get started
          </p>
        )}
        {activeView === "workspace" && selectedWorkspace && !selectedProjectId && (
          <p className="m-auto text-muted-foreground">
            Select a project to get started
          </p>
        )}
        {activeView === "workspace" && selectedWorkspace && selectedProjectId && (
          <ProjectPanel
            workspace={selectedWorkspace}
            projectId={selectedProjectId}
            onArchived={() => {
              setSelectedProjectId(null);
              setProjectsVersion((v) => v + 1);
            }}
          />
        )}
      </main>

      <DailyReviewDialog
        open={dailyReviewOpen}
        onOpenChange={setDailyReviewOpen}
        tasks={staleTasks}
        onFinished={refreshStale}
      />
      <Toaster />
      <ConfirmDialog />
    </div>
  );
}

export default App;
