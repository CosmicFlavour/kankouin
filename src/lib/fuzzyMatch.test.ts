import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzySearch } from "./fuzzyMatch";

describe("fuzzyScore", () => {
  it("matches when the query is a subsequence of the target", () => {
    expect(fuzzyScore("tsk", "Task")).not.toBeNull();
    expect(fuzzyScore("qr", "Quarterly Report")).not.toBeNull();
  });

  it("returns null when the query is not a subsequence of the target", () => {
    expect(fuzzyScore("xyz", "Task")).toBeNull();
    expect(fuzzyScore("tax", "Task")).toBeNull(); // wrong order
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("TSK", "task")).not.toBeNull();
    expect(fuzzyScore("tsk", "TASK")).not.toBeNull();
  });

  it("scores consecutive matches higher than scattered ones", () => {
    const consecutive = fuzzyScore("task", "Task: Quarterly Report");
    const scattered = fuzzyScore("task", "T r a n s a c t i o n K"); // subsequence, but scattered
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive as number).toBeGreaterThan(scattered as number);
  });

  it("scores a match at a word boundary higher than mid-word", () => {
    const wordStart = fuzzyScore("rep", "Task: Report");
    const midWord = fuzzyScore("rep", "Prepared");
    expect(wordStart).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordStart as number).toBeGreaterThan(midWord as number);
  });

  it("an empty query matches everything with a zero score", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("fuzzySearch", () => {
  const items = [
    { id: "1", title: "Task: Quarterly Report" },
    { id: "2", title: "Buy groceries" },
    { id: "3", title: "Prepare report" },
  ];

  it("returns an empty list for a blank query", () => {
    expect(fuzzySearch("", items, (i) => i.title)).toEqual([]);
    expect(fuzzySearch("   ", items, (i) => i.title)).toEqual([]);
  });

  it("filters out non-matching items", () => {
    const result = fuzzySearch("groceries", items, (i) => i.title);
    expect(result).toEqual([items[1]]);
  });

  it("ranks a clean consecutive match above a scattered one", () => {
    // Same pair verified individually in the fuzzyScore tests above — the
    // consecutive, word-start match scores strictly higher.
    const ranked = [
      { id: "consecutive", title: "Task: Quarterly Report" },
      { id: "scattered", title: "T r a n s a c t i o n K" },
    ];
    const result = fuzzySearch("task", ranked, (i) => i.title);
    expect(result.map((i) => i.id)).toEqual(["consecutive", "scattered"]);
  });

  it("tolerates typos and partial words via subsequence matching", () => {
    const result = fuzzySearch("qtly rpt", items, (i) => i.title);
    expect(result.map((i) => i.id)).toEqual(["1"]);
  });
});
