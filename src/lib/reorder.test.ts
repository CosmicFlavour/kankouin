import { describe, it, expect } from "vitest";
import { computeDropOrderIndex, previewDragOver } from "./reorder";

function list(...pairs: [string, number][]) {
  return pairs.map(([id, order_index]) => ({ id, order_index }));
}

interface Item {
  id: string;
  container: string;
}

function item(id: string, container: string): Item {
  return { id, container };
}

const singleListOptions = {
  isContainer: () => false,
  containerOf: () => "",
  withContainer: (t: Item) => t,
};

// Mirrors TaskBoard's real options: a column's droppable id (when you drop
// on empty column space) is the same string as its tasks' `state` value.
const containerOptions = {
  isContainer: (id: string) => ["todo", "doing"].includes(id),
  containerOf: (t: Item) => t.container,
  withContainer: (t: Item, container: string) => ({ ...t, container }),
};

describe("computeDropOrderIndex", () => {
  it("averages the neighbors on either side of the insertion point", () => {
    expect(computeDropOrderIndex(list(["a", 0], ["b", 2]), 1)).toBe(1);
  });

  it("goes one below the only following item when inserting at the start", () => {
    expect(computeDropOrderIndex(list(["a", 0], ["b", 2]), 0)).toBe(-1);
  });

  it("goes one above the only preceding item when inserting at the end", () => {
    expect(computeDropOrderIndex(list(["a", 0], ["b", 2]), 2)).toBe(3);
  });

  it("returns 0 for an empty list", () => {
    expect(computeDropOrderIndex([], 0)).toBe(0);
  });
});

describe("previewDragOver", () => {
  it("moves a dragged-down item past its new neighbor, in a single list", () => {
    const items = [item("A", ""), item("B", ""), item("C", ""), item("D", "")];
    const next = previewDragOver(items, "B", "D", singleListOptions);
    expect(next.map((t) => t.id)).toEqual(["A", "C", "D", "B"]);
  });

  it("moves a dragged-up item before its new neighbor, in a single list", () => {
    const items = [item("A", ""), item("B", ""), item("C", ""), item("D", "")];
    const next = previewDragOver(items, "D", "B", singleListOptions);
    expect(next.map((t) => t.id)).toEqual(["A", "D", "B", "C"]);
  });

  it("moving one slot down lands directly after the new neighbor", () => {
    const items = [item("A", ""), item("B", ""), item("C", ""), item("D", "")];
    const next = previewDragOver(items, "B", "C", singleListOptions);
    expect(next.map((t) => t.id)).toEqual(["A", "C", "B", "D"]);
  });

  it("does the same direction-correct move within one column of a mixed list", () => {
    // X/Y belong to a different container and should stay put relative
    // to their own neighbors, only shifting to make room.
    const items = [
      item("A", "todo"),
      item("X", "doing"),
      item("B", "todo"),
      item("C", "todo"),
      item("Y", "doing"),
      item("D", "todo"),
    ];
    const next = previewDragOver(items, "C", "D", containerOptions);
    expect(next.map((t) => t.id)).toEqual(["A", "X", "B", "Y", "D", "C"]);
  });

  it("inserts a task dragged into a different column before the hovered item", () => {
    const items = [item("A", "todo"), item("X", "doing"), item("Y", "doing")];
    const next = previewDragOver(items, "A", "Y", containerOptions);
    expect(next.map((t) => t.id)).toEqual(["X", "A", "Y"]);
    expect(next.find((t) => t.id === "A")?.container).toBe("doing");
  });

  it("appends at the end of a column's run when dropped on the column itself", () => {
    const items = [item("A", "todo"), item("X", "doing"), item("Y", "doing")];
    const next = previewDragOver(items, "A", "doing", containerOptions);
    expect(next.map((t) => t.id)).toEqual(["X", "Y", "A"]);
    expect(next.find((t) => t.id === "A")?.container).toBe("doing");
  });

  it("is a no-op when the dragged item is unknown", () => {
    const items = [item("A", "")];
    expect(previewDragOver(items, "ghost", "A", singleListOptions)).toBe(
      items,
    );
  });
});
