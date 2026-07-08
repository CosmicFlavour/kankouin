import { useEffect, useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useEpics } from "@/hooks/useEpics";
import { useUserStories } from "@/hooks/useUserStories";
import type { Workspace } from "@/hooks/useWorkspaces";
import { TaskBoard } from "@/components/TaskBoard";
import type { TaskScope } from "@/components/ScopeFilter";

interface ProjectPanelProps {
  workspace: Workspace;
  projectId: string;
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
}

export function ProjectPanel({
  workspace,
  projectId,
  focusTaskId,
  onFocusHandled,
}: ProjectPanelProps) {
  const { projects } = useProjects(workspace.id);
  const {
    epics,
    loading: epicsLoading,
    error: epicsError,
    createEpic,
  } = useEpics(projectId);
  const {
    userStories,
    loading: storiesLoading,
    error: storiesError,
    createUserStory,
  } = useUserStories(projectId);
  const [scope, setScope] = useState<TaskScope>(null);

  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    setScope(null);
  }, [projectId]);

  return (
    <div className="flex h-full flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {workspace.name} / {project?.name ?? "..."}
      </h2>

      <TaskBoard
        projectId={projectId}
        workspaceId={workspace.id}
        scope={scope}
        onScopeChange={setScope}
        epics={epics}
        epicsLoading={epicsLoading}
        epicsError={epicsError}
        onCreateEpic={createEpic}
        userStories={userStories}
        storiesLoading={storiesLoading}
        storiesError={storiesError}
        onCreateUserStory={createUserStory}
        focusTaskId={focusTaskId}
        onFocusHandled={onFocusHandled}
      />
    </div>
  );
}
