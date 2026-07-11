import { describe, it, expect } from "vitest";
import {
  fuzzyBucketLabel,
  fuzzyBucketClassName,
  exactDateUrgency,
  formatExactDate,
  isValidDateString,
} from "./deadline";

describe("fuzzyBucketLabel", () => {
  it("returns the label for a known bucket", () => {
    expect(fuzzyBucketLabel("this_week")).toBe("This Week");
    expect(fuzzyBucketLabel("someday")).toBe("Someday");
  });

  it("falls back to the raw value for an unknown bucket", () => {
    expect(fuzzyBucketLabel("next_decade")).toBe("next_decade");
  });
});

describe("fuzzyBucketClassName", () => {
  it("returns a class string for a known bucket", () => {
    expect(fuzzyBucketClassName("this_month")).toContain("violet");
  });

  it("falls back to the muted class for an unknown bucket", () => {
    expect(fuzzyBucketClassName("next_decade")).toBe(
      "bg-muted text-muted-foreground",
    );
  });
});

describe("exactDateUrgency", () => {
  const now = new Date(2026, 6, 11); // 2026-07-11, matches a fixed "today"

  it("flags a past date as overdue", () => {
    expect(exactDateUrgency("2026-07-10", now)).toBe("overdue");
  });

  it("flags the current date as today", () => {
    expect(exactDateUrgency("2026-07-11", now)).toBe("today");
  });

  it("flags a future date as normal", () => {
    expect(exactDateUrgency("2026-07-12", now)).toBe("normal");
  });
});

describe("formatExactDate", () => {
  it("formats an ISO date as a short month/day string", () => {
    expect(formatExactDate("2026-07-11")).toBe(
      new Date(2026, 6, 11).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
  });
});

describe("isValidDateString", () => {
  it("accepts a well-formed calendar date", () => {
    expect(isValidDateString("2026-07-11")).toBe(true);
  });

  it("accepts Feb 29 on a leap year", () => {
    expect(isValidDateString("2024-02-29")).toBe(true);
  });

  it("rejects Feb 29 on a non-leap year", () => {
    expect(isValidDateString("2026-02-29")).toBe(false);
  });

  it("rejects a day that doesn't exist in the month", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidDateString("2026-13-01")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isValidDateString("2026/07/11")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});
