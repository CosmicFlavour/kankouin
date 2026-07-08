import { useEffect, useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import type { Workspace } from "@/hooks/useWorkspaces";
import { TaskBoard } from "@/components/TaskBoard";
import { HierarchyPanel, type TaskScope } from "@/components/HierarchyPanel";

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

      <div className="flex flex-1 gap-4">
        <HierarchyPanel
          projectId={projectId}
          scope={scope}
          onScopeChange={setScope}
        />
        <TaskBoard
          projectId={projectId}
          workspaceId={workspace.id}
          scope={scope}
          focusTaskId={focusTaskId}
          onFocusHandled={onFocusHandled}
        />
      </div>
    </div>
  );
}
