import { describe, expect, it } from "vitest";
import { matchesAnyKeyword, normalizeKeywordValue } from "@/core/matcher";
import type { Keyword } from "@/core/types";

const kw = (value: string, enabled = true, id = value): Keyword => ({
  id,
  value,
  enabled,
});

describe("normalizeKeywordValue", () => {
  it("trims whitespace", () => {
    expect(normalizeKeywordValue("  foo  ")).toBe("foo");
  });

  it("lowercases", () => {
    expect(normalizeKeywordValue("FooBar")).toBe("foobar");
  });

  it("returns empty for whitespace-only", () => {
    expect(normalizeKeywordValue("   ")).toBe("");
  });
});

describe("matchesAnyKeyword", () => {
  it("returns false on empty keyword list", () => {
    expect(matchesAnyKeyword("https://x.com", "X", [])).toBe(false);
  });

  it("matches case-insensitively against url", () => {
    expect(matchesAnyKeyword("https://YouTube.com/watch", "v", [kw("youtube")])).toBe(true);
  });

  it("matches case-insensitively against title", () => {
    expect(matchesAnyKeyword("https://x.com", "Funny Cats Video", [kw("cats")])).toBe(true);
  });

  it("substring match (contains)", () => {
    expect(matchesAnyKeyword("https://news.example.com/article", "", [kw("example.com")])).toBe(
      true,
    );
  });

  it("returns false when nothing matches", () => {
    expect(matchesAnyKeyword("https://github.com", "Repo", [kw("youtube")])).toBe(false);
  });

  it("skips disabled keywords", () => {
    expect(matchesAnyKeyword("https://youtube.com", "v", [kw("youtube", false)])).toBe(false);
  });

  it("skips empty / whitespace-only keywords", () => {
    expect(matchesAnyKeyword("https://anything.com", "anything", [kw("   ", true, "ws")])).toBe(
      false,
    );
    expect(matchesAnyKeyword("https://anything.com", "anything", [kw("", true, "empty")])).toBe(
      false,
    );
  });

  it("tolerates null/undefined title", () => {
    expect(matchesAnyKeyword("https://cat.example", null, [kw("cat")])).toBe(true);
    expect(matchesAnyKeyword("https://cat.example", undefined, [kw("cat")])).toBe(true);
  });

  it("matches if at least one keyword in the list matches", () => {
    const keywords = [kw("nope"), kw("github")];
    expect(matchesAnyKeyword("https://github.com", "", keywords)).toBe(true);
  });

  it("ignores leading/trailing whitespace in keyword", () => {
    expect(matchesAnyKeyword("https://github.com", "", [kw("  github  ")])).toBe(true);
  });
});
