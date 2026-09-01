import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAllProjects } from "@/hooks/useAllProjects";
import { useStaleTasks } from "@/hooks/useStaleTasks";
import { useDatabaseStatus } from "@/hooks/useDatabaseStatus";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { ProjectPanel } from "@/components/ProjectPanel";
import { TodayView } from "@/components/TodayView";
import { TagsView } from "@/components/TagsView";
import { SearchView } from "@/components/SearchView";
import { DailyReviewDialog } from "@/components/DailyReviewDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
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
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  // ProjectPanel and the sidebar tree each hold their own useProjects
  // instance with no shared cache; bumping this forces both to re-fetch so
  // archiving from one is reflected in the other (see useProjects.ts).
  const [projectsVersion, setProjectsVersion] = useState(0);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  // Bumped after every AI chat reply so the open project's task board
  // re-fetches (see useTasks.ts's refreshKey) — the AI may have just
  // created/edited/moved a task via a tool call.
  const [aiRefreshSignal, setAiRefreshSignal] = useState(0);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const allProjects = useAllProjects(workspaces, projectsVersion);

  useEffect(() => {
    if (staleLoading || staleTasks.length === 0) return;
    const today = new Date().toDateString();
    if (localStorage.getItem(DAILY_REVIEW_LAST_SHOWN_KEY) === today) return;
    localStorage.setItem(DAILY_REVIEW_LAST_SHOWN_KEY, today);
    setDailyReviewOpen(true);
  }, [staleLoading, staleTasks]);

  useEffect(() => {
    const handleQuit = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "q" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        getCurrentWindow().close();
      }
    };
    window.addEventListener("keydown", handleQuit);
    return () => window.removeEventListener("keydown", handleQuit);
  }, []);

  useEffect(() => {
    function handleProjectSwitch(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key !== "r" && key !== "t") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (allProjects.length === 0) return;
      if (document.querySelector('[role="dialog"]')) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      event.preventDefault();
      const currentIndex = allProjects.findIndex(
        (p) => p.id === selectedProjectId,
      );
      const direction = key === "t" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + allProjects.length) %
            allProjects.length;
      const nextProject = allProjects[nextIndex];
      setActiveView("workspace");
      setSelectedWorkspaceId(nextProject.workspace_id);
      setSelectedProjectId(nextProject.id);
    }

    window.addEventListener("keydown", handleProjectSwitch);
    return () => window.removeEventListener("keydown", handleProjectSwitch);
  }, [selectedProjectId, allProjects]);

  useEffect(() => {
    function handleOverviewShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "o") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      event.preventDefault();
      setActiveView("today");
    }

    window.addEventListener("keydown", handleOverviewShortcut);
    return () => window.removeEventListener("keydown", handleOverviewShortcut);
  }, []);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key !== "s" && key !== "/") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      event.preventDefault();
      setActiveView("search");
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    function handleAiSidebarShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "a") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      event.preventDefault();
      setAiSidebarOpen((open) => !open);
    }

    window.addEventListener("keydown", handleAiSidebarShortcut);
    return () => window.removeEventListener("keydown", handleAiSidebarShortcut);
  }, []);

  useEffect(() => {
    function handleHelpShortcut(event: KeyboardEvent) {
      if (event.key !== "F1") return;
      if (document.querySelector('[role="dialog"]')) return;

      event.preventDefault();
      setShortcutsHelpOpen(true);
    }

    window.addEventListener("keydown", handleHelpShortcut);
    return () => window.removeEventListener("keydown", handleHelpShortcut);
  }, []);

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
        aiSidebarOpen={aiSidebarOpen}
        onToggleAiSidebar={() => setAiSidebarOpen((open) => !open)}
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
            refreshKey={aiRefreshSignal}
            onArchived={() => {
              setSelectedProjectId(null);
              setProjectsVersion((v) => v + 1);
            }}
          />
        )}
      </main>

      <AIChatSidebar
        open={aiSidebarOpen}
        projectId={activeView === "workspace" ? selectedProjectId : null}
        workspaceId={activeView === "workspace" ? selectedWorkspaceId : null}
        projectName={
          activeView === "workspace"
            ? allProjects.find((p) => p.id === selectedProjectId)?.name ?? null
            : null
        }
        workspaceName={
          activeView === "workspace" ? selectedWorkspace?.name ?? null : null
        }
        onMutation={() => setAiRefreshSignal((v) => v + 1)}
      />

      <DailyReviewDialog
        open={dailyReviewOpen}
        onOpenChange={setDailyReviewOpen}
        tasks={staleTasks}
        onFinished={refreshStale}
      />
      <ShortcutsDialog
        open={shortcutsHelpOpen}
        onOpenChange={setShortcutsHelpOpen}
      />
      <Toaster />
      <ConfirmDialog />
    </div>
  );
}

export default App;
