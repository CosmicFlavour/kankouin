import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceTreeItem } from "./WorkspaceTreeItem";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { mockCommands } from "@/test/tauriMock";
import { acceptConfirm, declineConfirm } from "@/test/confirmDialog";

const workspace = {
  id: "ws-1",
  name: "Personal",
  color: null,
  icon: null,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};

const project = {
  id: "p1",
  workspace_id: "ws-1",
  name: "Website relaunch",
  description: null,
  archived: false,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};

const archivedProject = {
  id: "p2",
  workspace_id: "ws-1",
  name: "Old website",
  description: null,
  archived: true,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
};

function renderItem({
  onDeleteWorkspace = vi.fn().mockResolvedValue(undefined),
  onRenameWorkspace = vi.fn().mockResolvedValue(undefined),
  onSelectProject = vi.fn(),
  onProjectsChanged = vi.fn(),
  selectedProjectId = null as string | null,
}: {
  onDeleteWorkspace?: ReturnType<typeof vi.fn>;
  onRenameWorkspace?: ReturnType<typeof vi.fn>;
  onSelectProject?: ReturnType<typeof vi.fn>;
  onProjectsChanged?: ReturnType<typeof vi.fn>;
  selectedProjectId?: string | null;
} = {}) {
  const user = userEvent.setup();
  render(
    <>
      <WorkspaceTreeItem
        workspace={workspace}
        isSelected={false}
        selectedProjectId={selectedProjectId}
        onSelectWorkspace={vi.fn()}
        onSelectProject={onSelectProject}
        onDeleteWorkspace={onDeleteWorkspace}
        onRenameWorkspace={onRenameWorkspace}
        onProjectsChanged={onProjectsChanged}
        projectsVersion={0}
      />
      <ConfirmDialog />
    </>,
  );
  return {
    user,
    onDeleteWorkspace,
    onRenameWorkspace,
    onSelectProject,
    onProjectsChanged,
  };
}

describe("WorkspaceTreeItem — projects", () => {
  it("expands to show active projects, not archived ones", async () => {
    mockCommands({
      list_projects: () => [project],
      list_archived_projects: () => [archivedProject],
    });
    const { user } = renderItem();

    await user.click(screen.getByRole("button", { name: "Personal" }));

    expect(await screen.findByText("Website relaunch")).toBeInTheDocument();
    expect(screen.queryByText("Old website")).not.toBeInTheDocument();
  });
});

describe("WorkspaceTreeItem — archived projects", () => {
  it("does not fetch archived projects until the row is expanded", async () => {
    const list_archived_projects = vi.fn(() => [archivedProject]);
    mockCommands({ list_projects: () => [project], list_archived_projects });
    const { user } = renderItem();

    await user.click(screen.getByRole("button", { name: "Personal" }));
    await screen.findByText("Website relaunch");

    expect(list_archived_projects).not.toHaveBeenCalled();
  });

  it("shows archived project names as plain, non-interactive text", async () => {
    mockCommands({
      list_projects: () => [project],
      list_archived_projects: () => [archivedProject],
    });
    const { user } = renderItem();

    await user.click(screen.getByRole("button", { name: "Personal" }));
    await screen.findByText("Website relaunch");
    await user.click(screen.getByRole("button", { name: "Archived" }));

    const entry = await screen.findByText("Old website");
    expect(entry.tagName).toBe("P");
    expect(screen.queryByRole("button", { name: "Old website" })).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no archived projects", async () => {
    mockCommands({ list_projects: () => [project], list_archived_projects: () => [] });
    const { user } = renderItem();

    await user.click(screen.getByRole("button", { name: "Personal" }));
    await screen.findByText("Website relaunch");
    await user.click(screen.getByRole("button", { name: "Archived" }));

    expect(await screen.findByText("No archived projects")).toBeInTheDocument();
  });
});

describe("WorkspaceTreeItem — delete workspace", () => {
  it("deletes only after the user confirms", async () => {
    mockCommands({ list_projects: () => [] });
    const { user, onDeleteWorkspace } = renderItem();

    await user.click(screen.getByRole("button", { name: "Delete workspace" }));
    await acceptConfirm(user);

    expect(onDeleteWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("does not delete when the user declines", async () => {
    mockCommands({ list_projects: () => [] });
    const { user, onDeleteWorkspace } = renderItem();

    await user.click(screen.getByRole("button", { name: "Delete workspace" }));
    await declineConfirm(user);

    expect(onDeleteWorkspace).not.toHaveBeenCalled();
  });

  it("shows an error when deletion fails", async () => {
    mockCommands({ list_projects: () => [] });
    const onDeleteWorkspace = vi.fn().mockRejectedValue(new Error("boom"));
    const { user } = renderItem({ onDeleteWorkspace });

    await user.click(screen.getByRole("button", { name: "Delete workspace" }));
    await acceptConfirm(user);

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });
});

describe("WorkspaceTreeItem — rename workspace", () => {
  it("renames on blur and calls onRenameWorkspace with the trimmed name", async () => {
    mockCommands({ list_projects: () => [] });
    const { user, onRenameWorkspace } = renderItem();

    await user.click(screen.getByRole("button", { name: "Rename workspace" }));
    const input = screen.getByDisplayValue("Personal");
    await user.clear(input);
    await user.type(input, "  Personal v2  ");
    await user.tab();

    expect(onRenameWorkspace).toHaveBeenCalledWith("ws-1", "Personal v2");
  });

  it("cancels the rename on Escape without calling onRenameWorkspace", async () => {
    mockCommands({ list_projects: () => [] });
    const { user, onRenameWorkspace } = renderItem();

    await user.click(screen.getByRole("button", { name: "Rename workspace" }));
    const input = screen.getByDisplayValue("Personal");
    await user.type(input, " v2");
    await user.keyboard("{Escape}");

    expect(onRenameWorkspace).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Personal" })).toBeInTheDocument();
  });

  it("shows an error when the rename fails", async () => {
    mockCommands({ list_projects: () => [] });
    const onRenameWorkspace = vi.fn().mockRejectedValue(new Error("name taken"));
    const { user } = renderItem({ onRenameWorkspace });

    await user.click(screen.getByRole("button", { name: "Rename workspace" }));
    const input = screen.getByDisplayValue("Personal");
    await user.clear(input);
    await user.type(input, "Personal v2");
    await user.tab();

    expect(await screen.findByText("Error: name taken")).toBeInTheDocument();
  });
});

describe("WorkspaceTreeItem — rename project", () => {
  it("renames a project row and reports the change upward", async () => {
    mockCommands({
      list_projects: () => [project],
      update_project: () => ({ ...project, name: "Website relaunch v2" }),
    });
    const { user, onProjectsChanged } = renderItem();

    await user.click(screen.getByRole("button", { name: "Personal" }));
    await screen.findByText("Website relaunch");

    await user.click(
      screen.getByRole("button", { name: "Rename Website relaunch" }),
    );
    const input = screen.getByDisplayValue("Website relaunch");
    await user.clear(input);
    await user.type(input, "Website relaunch v2");
    await user.tab();

    expect(await screen.findByText("Website relaunch v2")).toBeInTheDocument();
    expect(onProjectsChanged).toHaveBeenCalled();
  });

  it("does not show a delete button on project rows", async () => {
    mockCommands({ list_projects: () => [project] });
    const { user } = renderItem();

    await user.click(screen.getByRole("button", { name: "Personal" }));
    await screen.findByText("Website relaunch");

    expect(
      screen.queryByRole("button", { name: "Delete Website relaunch" }),
    ).not.toBeInTheDocument();
  });

  it("selecting a project row calls onSelectProject", async () => {
    mockCommands({ list_projects: () => [project] });
    const { user, onSelectProject } = renderItem();

    await user.click(screen.getByRole("button", { name: "Personal" }));
    await user.click(
      await screen.findByRole("button", { name: "Website relaunch" }),
    );

    expect(onSelectProject).toHaveBeenCalledWith("p1");
  });
});
