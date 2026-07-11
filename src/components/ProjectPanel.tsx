import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useProjects } from "@/hooks/useProjects";
import { useEpics } from "@/hooks/useEpics";
import { useUserStories } from "@/hooks/useUserStories";
import type { Workspace } from "@/hooks/useWorkspaces";
import { TaskBoard } from "@/components/TaskBoard";
import type { TaskScope } from "@/components/ScopeFilter";
import { Button } from "@/components/ui/button";

interface ProjectPanelProps {
  workspace: Workspace;
  projectId: string;
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
  onArchived?: () => void;
}

export function ProjectPanel({
  workspace,
  projectId,
  focusTaskId,
  onFocusHandled,
  onArchived,
}: ProjectPanelProps) {
  const { projects, archiveProject } = useProjects(workspace.id);
  const {
    epics,
    loading: epicsLoading,
    error: epicsError,
    createEpic,
    deleteEpic,
  } = useEpics(projectId);
  const {
    userStories,
    loading: storiesLoading,
    error: storiesError,
    createUserStory,
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
      onArchived?.();
    } catch (err) {
      setArchiveError(String(err));
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {workspace.name} / {project?.name ?? "..."}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={handleArchive}>
          <Trash2Icon /> Archive project
        </Button>
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
        focusTaskId={focusTaskId}
        onFocusHandled={onFocusHandled}
      />
    </div>
  );
}
