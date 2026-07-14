import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManageEpicsStoriesPanel } from "./ManageEpicsStoriesPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { acceptConfirm, declineConfirm } from "@/test/confirmDialog";
import { makeEpic, makeUserStory } from "@/test/factories";

const epic = makeEpic({ id: "epic-1", title: "Launch" });
const storyWithEpic = makeUserStory({
  id: "story-1",
  title: "Onboarding",
  epic_id: "epic-1",
});
const storyWithoutEpic = makeUserStory({
  id: "story-2",
  title: "Standalone",
  epic_id: null,
});

function renderPanel(overrides: Partial<Parameters<typeof ManageEpicsStoriesPanel>[0]> = {}) {
  const user = userEvent.setup();
  const onRenameEpic = vi.fn().mockResolvedValue(undefined);
  const onDeleteEpic = vi.fn().mockResolvedValue(undefined);
  const onRenameUserStory = vi.fn().mockResolvedValue(undefined);
  const onDeleteUserStory = vi.fn().mockResolvedValue(undefined);

  render(
    <>
      <ManageEpicsStoriesPanel
        trigger={<button type="button">Manage epics & stories</button>}
        epics={[epic]}
        epicsLoading={false}
        epicsError={null}
        onRenameEpic={onRenameEpic}
        onDeleteEpic={onDeleteEpic}
        userStories={[storyWithEpic, storyWithoutEpic]}
        storiesLoading={false}
        storiesError={null}
        onRenameUserStory={onRenameUserStory}
        onDeleteUserStory={onDeleteUserStory}
        {...overrides}
      />
      <ConfirmDialog />
    </>,
  );
  return { user, onRenameEpic, onDeleteEpic, onRenameUserStory, onDeleteUserStory };
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Manage epics & stories" }),
  );
}

describe("ManageEpicsStoriesPanel", () => {
  it("lists epics and user stories, with stories labeled by their parent epic", async () => {
    const { user } = renderPanel();
    await openPanel(user);

    expect(await screen.findByText("Launch")).toBeInTheDocument();
    expect(screen.getByText("Launch / Onboarding")).toBeInTheDocument();
    expect(screen.getByText("Standalone")).toBeInTheDocument();
  });

  it("renames an epic on blur and calls onRenameEpic with the trimmed title", async () => {
    const { user, onRenameEpic } = renderPanel();
    await openPanel(user);
    await screen.findByText("Launch");

    await user.click(screen.getByRole("button", { name: "Rename Launch" }));
    const input = screen.getByDisplayValue("Launch");
    await user.clear(input);
    await user.type(input, "  Launch v2  ");
    await user.tab();

    expect(onRenameEpic).toHaveBeenCalledWith("epic-1", "Launch v2");
  });

  it("cancels the rename on Escape without calling onRenameEpic", async () => {
    const { user, onRenameEpic } = renderPanel();
    await openPanel(user);
    await screen.findByText("Launch");

    await user.click(screen.getByRole("button", { name: "Rename Launch" }));
    const input = screen.getByDisplayValue("Launch");
    await user.type(input, " v2");
    await user.keyboard("{Escape}");

    expect(onRenameEpic).not.toHaveBeenCalled();
    expect(await screen.findByText("Launch")).toBeInTheDocument();
  });

  it("deletes an epic only after the user confirms", async () => {
    const { user, onDeleteEpic } = renderPanel();
    await openPanel(user);
    await screen.findByText("Launch");

    await user.click(screen.getByRole("button", { name: "Delete Launch" }));
    await acceptConfirm(user);

    expect(onDeleteEpic).toHaveBeenCalledWith("epic-1");
  });

  it("does not delete an epic when the user declines", async () => {
    const { user, onDeleteEpic } = renderPanel();
    await openPanel(user);
    await screen.findByText("Launch");

    await user.click(screen.getByRole("button", { name: "Delete Launch" }));
    await declineConfirm(user);

    expect(onDeleteEpic).not.toHaveBeenCalled();
  });

  it("renames a user story and calls onRenameUserStory with just the story title", async () => {
    const { user, onRenameUserStory } = renderPanel();
    await openPanel(user);
    await screen.findByText("Launch / Onboarding");

    await user.click(
      screen.getByRole("button", { name: "Rename Onboarding" }),
    );
    const input = screen.getByDisplayValue("Onboarding");
    await user.clear(input);
    await user.type(input, "Onboarding v2");
    await user.tab();

    expect(onRenameUserStory).toHaveBeenCalledWith("story-1", "Onboarding v2");
  });

  it("shows an error when a rename fails", async () => {
    const onRenameEpic = vi.fn().mockRejectedValue(new Error("boom"));
    const { user } = renderPanel({ onRenameEpic });
    await openPanel(user);
    await screen.findByText("Launch");

    await user.click(screen.getByRole("button", { name: "Rename Launch" }));
    const input = screen.getByDisplayValue("Launch");
    await user.clear(input);
    await user.type(input, "Launch v2");
    await user.tab();

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });

  it("shows placeholders when there are no epics or user stories", async () => {
    const { user } = renderPanel({ epics: [], userStories: [] });
    await openPanel(user);

    expect(await screen.findByText("No epics yet")).toBeInTheDocument();
    expect(screen.getByText("No user stories yet")).toBeInTheDocument();
  });
});
