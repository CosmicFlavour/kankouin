import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagsView } from "./TagsView";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { acceptConfirm, declineConfirm } from "@/test/confirmDialog";
import { makeTag } from "@/test/factories";

const urgentTag = makeTag({ id: "tag-1", name: "urgent", color: "#ff0000" });
const laterTag = makeTag({ id: "tag-2", name: "later", color: "#0000ff" });

function renderView(tags = [urgentTag, laterTag]) {
  mockCommands({
    list_tags: () => tags,
    create_tag: () => urgentTag,
    update_tag: () => urgentTag,
    delete_tag: () => undefined,
  });
  const user = userEvent.setup();
  render(
    <>
      <TagsView />
      <ConfirmDialog />
    </>,
  );
  return { user };
}

describe("TagsView", () => {
  it("lists every tag", async () => {
    renderView();
    expect(await screen.findByText("urgent")).toBeInTheDocument();
    expect(screen.getByText("later")).toBeInTheDocument();
  });

  it("shows a placeholder when there are no tags", async () => {
    renderView([]);
    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
  });

  it("creates a new tag and clears the name field", async () => {
    const { user } = renderView([]);
    await screen.findByText("No tags yet");

    const nameInput = screen.getByPlaceholderText("New tag");
    await user.type(nameInput, "urgent");
    await user.click(screen.getByRole("button", { name: "Add tag" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_tag", {
        name: "urgent",
        color: "#888888",
      }),
    );
    expect(nameInput).toHaveValue("");
  });

  it("does not create a tag with a blank name", async () => {
    const { user } = renderView([]);
    await screen.findByText("No tags yet");

    await user.click(screen.getByRole("button", { name: "Add tag" }));

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "create_tag",
      expect.anything(),
    );
  });

  it("renames and recolors a tag", async () => {
    const { user } = renderView();
    await screen.findByText("urgent");

    await user.click(screen.getByRole("button", { name: "Rename urgent" }));
    const nameInput = screen.getByDisplayValue("urgent");
    await user.clear(nameInput);
    await user.type(nameInput, "not-urgent");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_tag", {
        id: "tag-1",
        name: "not-urgent",
        color: "#ff0000",
      }),
    );
  });

  it("deletes a tag after confirming", async () => {
    const { user } = renderView();
    await screen.findByText("urgent");

    await user.click(screen.getByRole("button", { name: "Delete urgent" }));
    await acceptConfirm(user);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("delete_tag", { id: "tag-1" }),
    );
  });

  it("keeps the tag when deletion is declined", async () => {
    const { user } = renderView();
    await screen.findByText("urgent");

    await user.click(screen.getByRole("button", { name: "Delete urgent" }));
    await declineConfirm(user);

    expect(mockInvoke).not.toHaveBeenCalledWith("delete_tag", expect.anything());
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });
});
