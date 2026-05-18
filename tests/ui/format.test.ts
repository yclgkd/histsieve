import { describe, expect, it } from "vitest";
import { formatTimestamp } from "@/ui/shared/format";

describe("formatTimestamp", () => {
  it("returns fallback when null", () => {
    expect(formatTimestamp(null, "en-US", "never")).toBe("never");
  });

  it("returns fallback for non-finite", () => {
    expect(formatTimestamp(Number.NaN, "en-US", "never")).toBe("never");
  });

  it("returns a formatted string for valid timestamps", () => {
    const out = formatTimestamp(1_700_000_000_000, "en-US", "never");
    expect(out).not.toBe("never");
    expect(out.length).toBeGreaterThan(0);
  });
});
