import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriorityFilter } from "./PriorityFilter";

describe("PriorityFilter", () => {
  it("labels the trigger 'All priorities' when nothing is selected", () => {
    render(<PriorityFilter selectedPriorities={[]} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /All priorities/ }),
    ).toBeInTheDocument();
  });

  it("labels the trigger with the priority name when exactly one is selected", () => {
    render(<PriorityFilter selectedPriorities={["high"]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^High$/ })).toBeInTheDocument();
  });

  it("labels the trigger with a count when multiple are selected", () => {
    render(
      <PriorityFilter
        selectedPriorities={["high", "medium"]}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /2 priorities/ }),
    ).toBeInTheDocument();
  });

  it("opens to show every priority with the right checked state", async () => {
    const user = userEvent.setup();
    render(<PriorityFilter selectedPriorities={["high"]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^High$/ }));

    expect(await screen.findByRole("checkbox", { name: /high/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /medium/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /low/ })).not.toBeChecked();
  });

  it("checking a priority adds it to the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriorityFilter selectedPriorities={["high"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^High$/ }));
    await user.click(await screen.findByRole("checkbox", { name: /medium/ }));

    expect(onChange).toHaveBeenCalledWith(["high", "medium"]);
  });

  it("unchecking a priority removes it from the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriorityFilter selectedPriorities={["high"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^High$/ }));
    await user.click(await screen.findByRole("checkbox", { name: /high/ }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows a Clear link only when something is selected, and it clears the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriorityFilter selectedPriorities={["high"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^High$/ }));
    const clearButton = await screen.findByRole("button", { name: "Clear" });
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("does not show a Clear link when nothing is selected", async () => {
    const user = userEvent.setup();
    render(<PriorityFilter selectedPriorities={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /All priorities/ }));
    await screen.findByRole("checkbox", { name: /high/ });

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
