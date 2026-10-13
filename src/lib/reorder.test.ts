import { describe, it, expect } from "vitest";
import { computeDropOrderIndex, resolveDropOrderIndex } from "./reorder";

function list(...pairs: [string, number][]) {
  return pairs.map(([id, order_index]) => ({ id, order_index }));
}

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

describe("resolveDropOrderIndex", () => {
  it("moves a dragged-down item past its new neighbor, not back where it started", () => {
    // A(0) B(1) C(2) D(3) — drag C down onto D.
    const full = list(["A", 0], ["B", 1], ["C", 2], ["D", 3]);
    const next = resolveDropOrderIndex(full, "C", "D");
    expect(next).toBeGreaterThan(3); // now after D, not back between B and D
  });

  it("moves a dragged-up item before its new neighbor", () => {
    // A(0) B(1) C(2) D(3) — drag D up onto A.
    const full = list(["A", 0], ["B", 1], ["C", 2], ["D", 3]);
    const next = resolveDropOrderIndex(full, "D", "A");
    expect(next).toBeLessThan(0); // now before A
  });

  it("moving an item one slot down lands it directly after its new neighbor", () => {
    const full = list(["A", 0], ["B", 1], ["C", 2], ["D", 3]);
    const next = resolveDropOrderIndex(full, "B", "C");
    expect(next).toBeGreaterThan(2); // after C
    expect(next).toBeLessThan(3); // still before D
  });

  it("appends at the end when dropped on the list/column itself", () => {
    const full = list(["A", 0], ["B", 1]);
    expect(resolveDropOrderIndex(full, "A", null)).toBeGreaterThan(1);
  });

  it("inserts a foreign item (not yet a member) before the hovered item", () => {
    // Cross-column drop: the dragged task isn't part of this column's list.
    const target = list(["X", 0], ["Y", 1]);
    const next = resolveDropOrderIndex(target, "new-task", "Y");
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });
});
