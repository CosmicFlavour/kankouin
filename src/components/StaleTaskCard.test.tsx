import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaleTaskCard } from "./StaleTaskCard";
import { makeTask } from "@/test/factories";

function makeHandlers() {
  return {
    onMarkDone: vi.fn().mockResolvedValue(undefined),
    onMarkUnderReview: vi.fn().mockResolvedValue(undefined),
    onUpdateDeadline: vi.fn().mockResolvedValue(undefined),
    onSkip: vi.fn(),
  };
}

describe("StaleTaskCard", () => {
  it("shows the task title, location and how long it's been in its state", () => {
    const task = makeTask({
      title: "Ship the thing",
      state: "doing",
      state_since: "2026-06-01T00:00:00Z",
    });
    render(
      <StaleTaskCard task={task} location="Work / Website" {...makeHandlers()} />,
    );

    expect(screen.getByText("Ship the thing")).toBeInTheDocument();
    expect(screen.getByText("Work / Website")).toBeInTheDocument();
    // The "doing" / curly-quote text is split across multiple text nodes
    // (`&ldquo;doing&rdquo;`), so match on the paragraph's combined content.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          /In\s*.*doing.*since/.test(element.textContent ?? ""),
      ),
    ).toBeInTheDocument();
  });

  it("hides the location line when there is none", () => {
    const task = makeTask({ title: "Ship the thing" });
    render(<StaleTaskCard task={task} location={null} {...makeHandlers()} />);

    expect(screen.getByText("Ship the thing")).toBeInTheDocument();
    expect(screen.queryByText("Work / Website")).not.toBeInTheDocument();
  });

  it("hides the 'Mark Under Review' action when already under review", () => {
    const task = makeTask({ state: "under_review" });
    render(<StaleTaskCard task={task} location={null} {...makeHandlers()} />);

    expect(
      screen.queryByRole("button", { name: "Mark Under Review" }),
    ).not.toBeInTheDocument();
  });

  it("marking done calls onMarkDone", async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    const task = makeTask({ state: "doing" });
    render(<StaleTaskCard task={task} location={null} {...handlers} />);

    await user.click(screen.getByRole("button", { name: "Mark Done" }));

    expect(handlers.onMarkDone).toHaveBeenCalled();
  });

  it("marking under review calls onMarkUnderReview", async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    const task = makeTask({ state: "doing" });
    render(<StaleTaskCard task={task} location={null} {...handlers} />);

    await user.click(screen.getByRole("button", { name: "Mark Under Review" }));

    expect(handlers.onMarkUnderReview).toHaveBeenCalled();
  });

  it("skip calls onSkip synchronously without touching the other actions", async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    const task = makeTask({ state: "doing" });
    render(<StaleTaskCard task={task} location={null} {...handlers} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(handlers.onSkip).toHaveBeenCalled();
    expect(handlers.onMarkDone).not.toHaveBeenCalled();
    expect(handlers.onMarkUnderReview).not.toHaveBeenCalled();
  });

  it("surfaces an error when an action fails", async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    handlers.onMarkDone.mockRejectedValue(new Error("boom"));
    const task = makeTask({ state: "doing" });
    render(<StaleTaskCard task={task} location={null} {...handlers} />);

    await user.click(screen.getByRole("button", { name: "Mark Done" }));

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });

  it("updates the deadline to an exact date and defaults the input to a date field", async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    const task = makeTask({ state: "doing" });
    render(<StaleTaskCard task={task} location={null} {...handlers} />);

    const dateInput = screen.getByDisplayValue("");
    await user.type(dateInput, "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Update deadline" }));

    expect(handlers.onUpdateDeadline).toHaveBeenCalledWith("exact", "2026-08-01");
  });

  it("switching to fuzzy and submitting updates the deadline with the default bucket", async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    const task = makeTask({ state: "doing" });
    render(<StaleTaskCard task={task} location={null} {...handlers} />);

    await user.selectOptions(screen.getByDisplayValue("Exact date"), "fuzzy");
    await user.click(screen.getByRole("button", { name: "Update deadline" }));

    expect(handlers.onUpdateDeadline).toHaveBeenCalledWith("fuzzy", "this_week");
  });

  it("does not submit when no deadline value is set", async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    const task = makeTask({ state: "doing" });
    render(<StaleTaskCard task={task} location={null} {...handlers} />);

    await user.click(screen.getByRole("button", { name: "Update deadline" }));

    expect(handlers.onUpdateDeadline).not.toHaveBeenCalled();
  });
});
