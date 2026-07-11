import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagFilter } from "./TagFilter";

const urgentTag = { id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "#ff0000" };
const laterTag = { id: "tag-2", workspace_id: "ws-1", name: "later", color: "#0000ff" };

describe("TagFilter", () => {
  it("labels the trigger 'All tags' when nothing is selected", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /All tags/ })).toBeInTheDocument();
  });

  it("labels the trigger with the tag name when exactly one is selected", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={["tag-1"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /urgent/ })).toBeInTheDocument();
  });

  it("labels the trigger with a count when multiple are selected", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={["tag-1", "tag-2"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /2 tags/ })).toBeInTheDocument();
  });

  it("opens to show every tag with the right checked state", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={["tag-1"]}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /urgent/ }));

    expect(await screen.findByRole("checkbox", { name: /urgent/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /later/ })).not.toBeChecked();
  });

  it("checking a tag adds it to the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={["tag-1"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /urgent/ }));
    await user.click(await screen.findByRole("checkbox", { name: /later/ }));

    expect(onChange).toHaveBeenCalledWith(["tag-1", "tag-2"]);
  });

  it("unchecking a tag removes it from the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={["tag-1"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /urgent/ }));
    await user.click(await screen.findByRole("checkbox", { name: /urgent/ }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows a Clear link only when something is selected, and it clears the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={["tag-1"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /urgent/ }));
    const clearButton = await screen.findByRole("button", { name: "Clear" });
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("does not show a Clear link when nothing is selected", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        selectedTagIds={[]}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /All tags/ }));
    await screen.findByRole("checkbox", { name: /urgent/ });

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows a placeholder when the workspace has no tags", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[]}
        loading={false}
        error={null}
        selectedTagIds={[]}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /All tags/ }));

    expect(
      await screen.findByText("No tags in this workspace yet"),
    ).toBeInTheDocument();
  });

  it("surfaces a load error inside the popover", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[]}
        loading={false}
        error="db is locked"
        selectedTagIds={[]}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /All tags/ }));

    expect(
      await screen.findByText("Couldn't load tags: db is locked"),
    ).toBeInTheDocument();
  });
});
