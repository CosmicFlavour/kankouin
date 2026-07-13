import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { TaskColumn } from "./TaskColumn";
import { makeTask } from "@/test/factories";

// TaskColumn (useDroppable) and the TaskCards it renders (useDraggable) both
// read from dnd-kit's context, so every render needs a DndContext ancestor —
// same as TaskBoard provides in the real app.
function renderColumn(tasks = [makeTask({ id: "t1", title: "Write draft" })]) {
  const onSelectTask = vi.fn();
  render(
    <DndContext onDragEnd={vi.fn()}>
      <TaskColumn
        state="todo"
        label="Todo"
        tasks={tasks}
        epics={[]}
        userStories={[]}
        onSelectTask={onSelectTask}
      />
    </DndContext>,
  );
  return { onSelectTask };
}

describe("TaskColumn", () => {
  it("shows the column label and task count", () => {
    renderColumn([makeTask({ id: "t1" }), makeTask({ id: "t2" })]);
    expect(screen.getByText("Todo (2)")).toBeInTheDocument();
  });

  it("shows a zero count with no cards when empty", () => {
    renderColumn([]);
    expect(screen.getByText("Todo (0)")).toBeInTheDocument();
    expect(screen.queryByText("Write draft")).not.toBeInTheDocument();
  });

  it("renders a card per task", () => {
    renderColumn([
      makeTask({ id: "t1", title: "Write draft" }),
      makeTask({ id: "t2", title: "Review PR" }),
    ]);
    expect(screen.getByText("Write draft")).toBeInTheDocument();
    expect(screen.getByText("Review PR")).toBeInTheDocument();
  });

  it("clicking a card selects its task", () => {
    // fireEvent, not userEvent: userEvent's synthetic pointerdown/up
    // sequence is intercepted by @dnd-kit's drag sensor (attached via
    // useDraggable's spread listeners) and never reaches a click in jsdom.
    // A plain click event is all this component cares about.
    const { onSelectTask } = renderColumn([
      makeTask({ id: "t1", title: "Write draft" }),
    ]);

    fireEvent.click(screen.getByText("Write draft"));

    expect(onSelectTask).toHaveBeenCalledWith("t1");
  });

  it("marks an archived task's card as archived and still selectable", () => {
    const { onSelectTask } = renderColumn([
      makeTask({ id: "t1", title: "Old task", archived: true }),
    ]);

    expect(screen.getByText(/^Archived —/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Old task"));

    expect(onSelectTask).toHaveBeenCalledWith("t1");
  });
});
