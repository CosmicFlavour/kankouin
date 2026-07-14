import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeadlineFilter } from "./DeadlineFilter";

describe("DeadlineFilter", () => {
  it("labels the trigger 'All deadlines' when nothing is selected", () => {
    render(<DeadlineFilter selectedBuckets={[]} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /All deadlines/ }),
    ).toBeInTheDocument();
  });

  it("labels the trigger with the bucket name when exactly one is selected", () => {
    render(<DeadlineFilter selectedBuckets={["overdue"]} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /^Overdue$/ }),
    ).toBeInTheDocument();
  });

  it("labels the trigger with a count when multiple are selected", () => {
    render(
      <DeadlineFilter
        selectedBuckets={["overdue", "today"]}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /2 deadlines/ }),
    ).toBeInTheDocument();
  });

  it("opens to show every bucket with the right checked state", async () => {
    const user = userEvent.setup();
    render(<DeadlineFilter selectedBuckets={["overdue"]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^Overdue$/ }));

    expect(
      await screen.findByRole("checkbox", { name: "Overdue" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "This Week" }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Someday" })).not.toBeChecked();
  });

  it("checking a bucket adds it to the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DeadlineFilter selectedBuckets={["overdue"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^Overdue$/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Today" }));

    expect(onChange).toHaveBeenCalledWith(["overdue", "today"]);
  });

  it("unchecking a bucket removes it from the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DeadlineFilter selectedBuckets={["overdue"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^Overdue$/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Overdue" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows a Clear link only when something is selected, and it clears the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DeadlineFilter selectedBuckets={["overdue"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^Overdue$/ }));
    const clearButton = await screen.findByRole("button", { name: "Clear" });
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("does not show a Clear link when nothing is selected", async () => {
    const user = userEvent.setup();
    render(<DeadlineFilter selectedBuckets={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /All deadlines/ }));
    await screen.findByRole("checkbox", { name: "Overdue" });

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
