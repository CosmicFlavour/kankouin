import { describe, it, expect } from "vitest";
import { priorityCardClassName, priorityButtonClassName } from "./priority";

describe("priorityCardClassName", () => {
  it("returns the red palette for high priority", () => {
    expect(priorityCardClassName("high")).toContain("red");
  });

  it("returns the amber palette for medium priority", () => {
    expect(priorityCardClassName("medium")).toContain("amber");
  });

  it("returns the muted palette for any other priority", () => {
    expect(priorityCardClassName("low")).toBe("bg-muted border-border");
    expect(priorityCardClassName("unknown")).toBe("bg-muted border-border");
  });
});

describe("priorityButtonClassName", () => {
  it("returns the muted unselected style regardless of priority when not selected", () => {
    expect(priorityButtonClassName("high", false)).toBe(
      "text-muted-foreground hover:bg-muted",
    );
    expect(priorityButtonClassName("low", false)).toBe(
      "text-muted-foreground hover:bg-muted",
    );
  });

  it("returns the red palette for a selected high priority", () => {
    expect(priorityButtonClassName("high", true)).toContain("red");
  });

  it("returns the amber palette for a selected medium priority", () => {
    expect(priorityButtonClassName("medium", true)).toContain("amber");
  });

  it("returns the muted-foreground palette for a selected low priority", () => {
    expect(priorityButtonClassName("low", true)).toBe(
      "bg-muted text-foreground",
    );
  });
});
