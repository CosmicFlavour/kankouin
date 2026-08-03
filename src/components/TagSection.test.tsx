import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagSection } from "./TagSection";
import { mockCommands } from "@/test/tauriMock";
import { makeTag } from "@/test/factories";

const urgentTag = makeTag({ id: "tag-1", name: "urgent", color: "#ff0000" });
const laterTag = makeTag({ id: "tag-2", name: "later", color: "#0000ff" });

describe("TagSection", () => {
  it("shows a placeholder when there are no tags yet", async () => {
    mockCommands({ list_tags: () => [] });
    render(<TagSection taskTags={[]} onChangeTags={vi.fn()} />);

    expect(
      await screen.findByText("No tags yet — create one from the Tags view"),
    ).toBeInTheDocument();
  });

  it("renders each tag, checked when it's already on the task", async () => {
    mockCommands({ list_tags: () => [urgentTag, laterTag] });
    render(<TagSection taskTags={[urgentTag]} onChangeTags={vi.fn()} />);

    const urgentCheckbox = await screen.findByRole("checkbox", { name: /urgent/ });
    const laterCheckbox = screen.getByRole("checkbox", { name: /later/ });
    expect(urgentCheckbox).toBeChecked();
    expect(laterCheckbox).not.toBeChecked();
  });

  it("toggling an unchecked tag adds it to the task's tag ids", async () => {
    const user = userEvent.setup();
    const onChangeTags = vi.fn().mockResolvedValue(undefined);
    mockCommands({ list_tags: () => [urgentTag, laterTag] });
    render(<TagSection taskTags={[urgentTag]} onChangeTags={onChangeTags} />);

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
    render(<TagSection taskTags={[urgentTag]} onChangeTags={onChangeTags} />);

    await user.click(await screen.findByRole("checkbox", { name: /urgent/ }));

    expect(onChangeTags).toHaveBeenCalledWith([], [urgentTag, laterTag]);
  });

  it("shows an error when toggling a tag fails", async () => {
    const user = userEvent.setup();
    const onChangeTags = vi.fn().mockRejectedValue(new Error("boom"));
    mockCommands({ list_tags: () => [urgentTag] });
    render(<TagSection taskTags={[]} onChangeTags={onChangeTags} />);

    await user.click(await screen.findByRole("checkbox", { name: /urgent/ }));

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });

  it("does not render a create form or delete controls", async () => {
    mockCommands({ list_tags: () => [urgentTag] });
    render(<TagSection taskTags={[]} onChangeTags={vi.fn()} />);
    await screen.findByRole("checkbox", { name: /urgent/ });

    expect(screen.queryByPlaceholderText("New tag")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add tag" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });
});
