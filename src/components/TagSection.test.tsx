import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagSection } from "./TagSection";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const urgentTag = { id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "#ff0000" };
const laterTag = { id: "tag-2", workspace_id: "ws-1", name: "later", color: "#0000ff" };

describe("TagSection", () => {
  it("shows a placeholder when the workspace has no tags", async () => {
    mockCommands({ list_tags: () => [] });
    render(<TagSection workspaceId="ws-1" taskTags={[]} onChangeTags={vi.fn()} />);

    expect(
      await screen.findByText("No tags in this workspace yet"),
    ).toBeInTheDocument();
  });

  it("renders each tag, checked when it's already on the task", async () => {
    mockCommands({ list_tags: () => [urgentTag, laterTag] });
    render(
      <TagSection
        workspaceId="ws-1"
        taskTags={[urgentTag]}
        onChangeTags={vi.fn()}
      />,
    );

    const urgentCheckbox = await screen.findByRole("checkbox", { name: /urgent/ });
    const laterCheckbox = screen.getByRole("checkbox", { name: /later/ });
    expect(urgentCheckbox).toBeChecked();
    expect(laterCheckbox).not.toBeChecked();
  });

  it("toggling an unchecked tag adds it to the task's tag ids", async () => {
    const user = userEvent.setup();
    const onChangeTags = vi.fn().mockResolvedValue(undefined);
    mockCommands({ list_tags: () => [urgentTag, laterTag] });
    render(
      <TagSection
        workspaceId="ws-1"
        taskTags={[urgentTag]}
        onChangeTags={onChangeTags}
      />,
    );

    await user.click(await screen.findByRole("checkbox", { name: /later/ }));

    expect(onChangeTags).toHaveBeenCalledWith(
      ["tag-1", "tag-2"],
      [urgentTag, laterTag],
    );
  });

  it("toggling a checked tag removes it from the task's tag ids", async () => {
    const user = userEvent.setup();
    const onChangeTags = vi.fn().mockResolvedValue(undefined);
    mockCommands({ list_tags: () => [urgentTag, laterTag] });
    render(
      <TagSection
        workspaceId="ws-1"
        taskTags={[urgentTag]}
        onChangeTags={onChangeTags}
      />,
    );

    await user.click(await screen.findByRole("checkbox", { name: /urgent/ }));

    expect(onChangeTags).toHaveBeenCalledWith([], [urgentTag, laterTag]);
  });

  it("shows an error when toggling a tag fails", async () => {
    const user = userEvent.setup();
    const onChangeTags = vi.fn().mockRejectedValue(new Error("boom"));
    mockCommands({ list_tags: () => [urgentTag] });
    render(
      <TagSection workspaceId="ws-1" taskTags={[]} onChangeTags={onChangeTags} />,
    );

    await user.click(await screen.findByRole("checkbox", { name: /urgent/ }));

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });

  it("creates a new tag and clears the name field", async () => {
    const user = userEvent.setup();
    mockCommands({
      list_tags: () => [],
      create_tag: () => urgentTag,
    });
    render(<TagSection workspaceId="ws-1" taskTags={[]} onChangeTags={vi.fn()} />);
    await screen.findByText("No tags in this workspace yet");

    const nameInput = screen.getByPlaceholderText("New tag");
    await user.type(nameInput, "urgent");
    await user.click(screen.getByRole("button", { name: "Add tag" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_tag", {
        workspaceId: "ws-1",
        name: "urgent",
        color: "#888888",
      }),
    );
    expect(nameInput).toHaveValue("");
  });

  it("does not create a tag with a blank name", async () => {
    const user = userEvent.setup();
    mockCommands({ list_tags: () => [] });
    render(<TagSection workspaceId="ws-1" taskTags={[]} onChangeTags={vi.fn()} />);
    await screen.findByText("No tags in this workspace yet");

    await user.click(screen.getByRole("button", { name: "Add tag" }));

    await waitFor(() =>
      expect(mockInvoke).not.toHaveBeenCalledWith(
        "create_tag",
        expect.anything(),
      ),
    );
  });

  it("shows an error when creating a tag fails", async () => {
    const user = userEvent.setup();
    mockCommands({
      list_tags: () => [],
      create_tag: () => {
        throw new Error("name taken");
      },
    });
    render(<TagSection workspaceId="ws-1" taskTags={[]} onChangeTags={vi.fn()} />);
    await screen.findByText("No tags in this workspace yet");

    await user.type(screen.getByPlaceholderText("New tag"), "urgent");
    await user.click(screen.getByRole("button", { name: "Add tag" }));

    expect(await screen.findByText("Error: name taken")).toBeInTheDocument();
  });
});
