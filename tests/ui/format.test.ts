import { describe, expect, it } from "vitest";
import { formatTimestamp } from "@/ui/shared/format";

describe("formatTimestamp", () => {
  it("returns fallback when null", () => {
    expect(formatTimestamp(null, "en-US", "never")).toBe("never");
  });

  it("returns fallback for non-finite", () => {
    expect(formatTimestamp(Number.NaN, "en-US", "never")).toBe("never");
  });

  it("formats a valid timestamp into a locale date string", () => {
    const ts = Date.UTC(2023, 10, 14, 22, 13, 20);
    const out = formatTimestamp(ts, "en-US", "never");
    expect(out).not.toBe("never");
    // Within any real timezone offset the date stays on 2023-11-14/15.
    expect(out).toContain("2023");
  });

  it("falls back to the ISO string when the locale is invalid", () => {
    const ts = Date.UTC(2023, 10, 14, 22, 13, 20);
    expect(formatTimestamp(ts, "!!invalid!!", "never")).toBe(new Date(ts).toISOString());
  });
});
