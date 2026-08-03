import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManageableItemRow } from "./ManageableItemRow";

describe("ManageableItemRow", () => {
  it("renders a plain label when onSelect is not given", async () => {
    render(
      <ManageableItemRow
        title="Launch"
        entityLabel="Item"
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Launch" }),
    ).not.toBeInTheDocument();
  });

  it("renders a clickable button when onSelect is given, and calls it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ManageableItemRow
        title="Launch"
        entityLabel="Item"
        onRename={vi.fn()}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Launch" }));

    expect(onSelect).toHaveBeenCalled();
  });

  it("applies selected styling only when selected is true", () => {
    const { rerender } = render(
      <ManageableItemRow
        title="Launch"
        entityLabel="Item"
        onRename={vi.fn()}
        onSelect={vi.fn()}
        selected={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Launch" })).not.toHaveClass(
      "bg-accent",
    );

    rerender(
      <ManageableItemRow
        title="Launch"
        entityLabel="Item"
        onRename={vi.fn()}
        onSelect={vi.fn()}
        selected
      />,
    );
    expect(screen.getByRole("button", { name: "Launch" })).toHaveClass(
      "bg-accent",
    );
  });

  it("omits the delete button when onDelete is not given", async () => {
    render(
      <ManageableItemRow
        title="Launch"
        entityLabel="Item"
        onRename={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Delete Launch" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rename Launch" }),
    ).toBeInTheDocument();
  });
});
