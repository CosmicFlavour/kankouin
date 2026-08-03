import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagFilter, type TagFilterValue } from "./TagFilter";
import { makeTag } from "@/test/factories";

const urgentTag = makeTag({ id: "tag-1", name: "urgent", color: "#ff0000" });
const laterTag = makeTag({ id: "tag-2", name: "later", color: "#0000ff" });

const empty: TagFilterValue = { include: [], exclude: [] };

describe("TagFilter", () => {
  it("labels the trigger 'All tags' when nothing is selected", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={empty}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /All tags/ })).toBeInTheDocument();
  });

  it("labels the trigger with the tag name when exactly one is included", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={{ include: ["tag-1"], exclude: [] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^urgent$/ })).toBeInTheDocument();
  });

  it("labels the trigger with a count when multiple are included", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={{ include: ["tag-1", "tag-2"], exclude: [] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^2 tags$/ })).toBeInTheDocument();
  });

  it("labels the trigger with an excluding count when only excludes are set", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={{ include: [], exclude: ["tag-1"] }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /^excluding 1$/ }),
    ).toBeInTheDocument();
  });

  it("labels the trigger with both parts when include and exclude are both set", () => {
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={{ include: ["tag-1"], exclude: ["tag-2"] }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "urgent, excluding 1" }),
    ).toBeInTheDocument();
  });

  it("opens to show every tag with the right pressed state", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={{ include: ["tag-1"], exclude: ["tag-2"] }}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "urgent, excluding 1" }));

    expect(screen.getByRole("button", { name: "Include urgent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Exclude urgent" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Include later" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Exclude later" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking Include on a neutral tag adds it to include", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag]}
        loading={false}
        error={null}
        value={empty}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /All tags/ }));
    await user.click(await screen.findByRole("button", { name: "Include urgent" }));

    expect(onChange).toHaveBeenCalledWith({ include: ["tag-1"], exclude: [] });
  });

  it("clicking an already-included tag's Include button clears it back to neutral", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag]}
        loading={false}
        error={null}
        value={{ include: ["tag-1"], exclude: [] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "urgent" }));
    await user.click(screen.getByRole("button", { name: "Include urgent" }));

    expect(onChange).toHaveBeenCalledWith({ include: [], exclude: [] });
  });

  it("clicking Exclude on an included tag moves it from include to exclude", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag]}
        loading={false}
        error={null}
        value={{ include: ["tag-1"], exclude: [] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "urgent" }));
    await user.click(screen.getByRole("button", { name: "Exclude urgent" }));

    expect(onChange).toHaveBeenCalledWith({ include: [], exclude: ["tag-1"] });
  });

  it("clicking Include on an excluded tag moves it from exclude to include", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag]}
        loading={false}
        error={null}
        value={{ include: [], exclude: ["tag-1"] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "excluding 1" }));
    await user.click(screen.getByRole("button", { name: "Include urgent" }));

    expect(onChange).toHaveBeenCalledWith({ include: ["tag-1"], exclude: [] });
  });

  it("shows a Clear link when either include or exclude is set, and it clears both", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={{ include: ["tag-1"], exclude: ["tag-2"] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "urgent, excluding 1" }));
    const clearButton = await screen.findByRole("button", { name: "Clear" });
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith({ include: [], exclude: [] });
  });

  it("does not show a Clear link when nothing is selected", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[urgentTag, laterTag]}
        loading={false}
        error={null}
        value={empty}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /All tags/ }));
    await screen.findByRole("button", { name: "Include urgent" });

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no tags", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[]}
        loading={false}
        error={null}
        value={empty}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /All tags/ }));

    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
  });

  it("surfaces a load error inside the popover", async () => {
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[]}
        loading={false}
        error="db is locked"
        value={empty}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /All tags/ }));

    expect(
      await screen.findByText("Couldn't load tags: db is locked"),
    ).toBeInTheDocument();
  });
});
