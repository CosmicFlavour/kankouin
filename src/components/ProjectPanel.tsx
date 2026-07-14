import { useEffect, useState } from "react";
import { FolderTreeIcon, Trash2Icon } from "lucide-react";
import { confirm } from "@/hooks/useConfirm";
import { useProjects } from "@/hooks/useProjects";
import { useEpics } from "@/hooks/useEpics";
import { useUserStories } from "@/hooks/useUserStories";
import type { Workspace } from "@/hooks/useWorkspaces";
import { TaskBoard } from "@/components/TaskBoard";
import type { TaskScope } from "@/components/ScopeFilter";
import { ManageEpicsStoriesPanel } from "@/components/ManageEpicsStoriesPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";

interface ProjectPanelProps {
  workspace: Workspace;
  projectId: string;
  onArchived?: () => void;
}

export function ProjectPanel({
  workspace,
  projectId,
  onArchived,
}: ProjectPanelProps) {
  const { projects, archiveProject } = useProjects(workspace.id);
  const {
    epics,
    loading: epicsLoading,
    error: epicsError,
    createEpic,
    updateEpic,
    deleteEpic,
  } = useEpics(projectId);
  const {
    userStories,
    loading: storiesLoading,
    error: storiesError,
    createUserStory,
    updateUserStory,
    deleteUserStory,
  } = useUserStories(projectId);
  const [scope, setScope] = useState<TaskScope>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    setScope(null);
  }, [projectId]);

  // Archiving is the only "delete" path for a project — it hides the
  // project (and its tasks) from active views but keeps the data, since
  // there's currently no permanent, hard-delete command for projects.
  async function handleArchive() {
    setArchiveError(null);
    const confirmed = await confirm(
      `Archive "${project?.name ?? "this project"}"? It will be hidden along with its tasks. This can be changed later.`,
      { title: "Archive project?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await archiveProject(projectId);
      toast({ title: "Project archived", description: project?.name });
      onArchived?.();
    } catch (err) {
      setArchiveError(String(err));
    }
  }

  // Same scope-reset bookkeeping as TaskBoard's own handleDeleteEpic /
  // handleDeleteUserStory (deleting the currently-scoped epic/story from
  // this panel shouldn't leave the board filtered by a now-deleted scope).
  async function handleDeleteEpic(epicId: string) {
    await deleteEpic(epicId);
    if (scope?.type === "epic" && scope.id === epicId) setScope(null);
  }

  async function handleDeleteUserStory(storyId: string) {
    await deleteUserStory(storyId);
    if (scope?.type === "story" && scope.id === storyId) setScope(null);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {workspace.name} / {project?.name ?? "..."}
        </h2>
        <div className="flex items-center gap-1">
          <ManageEpicsStoriesPanel
            trigger={
              <Button type="button" variant="ghost" size="sm">
                <FolderTreeIcon /> Manage epics & stories
              </Button>
            }
            epics={epics}
            epicsLoading={epicsLoading}
            epicsError={epicsError}
            onRenameEpic={updateEpic}
            onDeleteEpic={handleDeleteEpic}
            userStories={userStories}
            storiesLoading={storiesLoading}
            storiesError={storiesError}
            onRenameUserStory={updateUserStory}
            onDeleteUserStory={handleDeleteUserStory}
          />
          <Button type="button" variant="ghost" size="sm" onClick={handleArchive}>
            <Trash2Icon /> Archive project
          </Button>
        </div>
      </div>
      {archiveError && <p className="text-sm text-destructive">{archiveError}</p>}

      <TaskBoard
        projectId={projectId}
        workspaceId={workspace.id}
        scope={scope}
        onScopeChange={setScope}
        epics={epics}
        epicsLoading={epicsLoading}
        epicsError={epicsError}
        onCreateEpic={createEpic}
        onDeleteEpic={deleteEpic}
        userStories={userStories}
        storiesLoading={storiesLoading}
        storiesError={storiesError}
        onCreateUserStory={createUserStory}
        onDeleteUserStory={deleteUserStory}
      />
    </div>
  );
}
