import { describe, expect, it } from "vitest";
import { daysToMs, hoursToMinutes, ageCutoff } from "@/core/time";

describe("daysToMs", () => {
  it("converts days to milliseconds", () => {
    expect(daysToMs(1)).toBe(86_400_000);
    expect(daysToMs(0)).toBe(0);
    expect(daysToMs(30)).toBe(30 * 86_400_000);
  });
});

describe("hoursToMinutes", () => {
  it("converts hours to minutes", () => {
    expect(hoursToMinutes(1)).toBe(60);
    expect(hoursToMinutes(24)).toBe(1440);
  });
});

describe("ageCutoff", () => {
  it("returns now - days*86400000", () => {
    const now = 1_700_000_000_000;
    expect(ageCutoff(now, 7)).toBe(now - 7 * 86_400_000);
  });

  it("returns 0 cutoff for 0 days (cleans everything up to now)", () => {
    expect(ageCutoff(1000, 0)).toBe(1000);
  });
});
