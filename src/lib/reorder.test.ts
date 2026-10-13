import { describe, it, expect } from "vitest";
import { computeDropOrderIndex } from "./reorder";

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
