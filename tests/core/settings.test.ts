import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  addKeyword,
  removeKeyword,
  setKeywordEnabled,
  updateKeywordValue,
  validateSettings,
  setCleanupConfig,
  isValidKeywordValue,
  exportKeywords,
  parseKeywordsExport,
  mergeKeywords,
  replaceKeywords,
} from "@/core/settings";
import type { Keyword, Settings } from "@/core/types";

describe("DEFAULT_SETTINGS", () => {
  it("has sane defaults", () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.keywords).toEqual([]);
    expect(DEFAULT_SETTINGS.cleanup.intervalEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.cleanup.intervalHours).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.cleanup.onStartup).toBe(true);
    expect(DEFAULT_SETTINGS.cleanup.scope).toBe("olderThan");
    expect(DEFAULT_SETTINGS.cleanup.olderThanDays).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.lastCleanAt).toBeNull();
  });

  it("is deeply immutable in the type sense (no shared keyword array)", () => {
    expect(DEFAULT_SETTINGS.keywords.length).toBe(0);
  });
});

describe("validateSettings", () => {
  it("returns defaults for null / undefined", () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("fills in missing fields from partial input", () => {
    const v = validateSettings({ enabled: false });
    expect(v.enabled).toBe(false);
    expect(v.keywords).toEqual([]);
    expect(v.cleanup).toEqual(DEFAULT_SETTINGS.cleanup);
  });

  it("clamps interval and days to a sensible minimum", () => {
    const v = validateSettings({
      cleanup: { ...DEFAULT_SETTINGS.cleanup, intervalHours: 0, olderThanDays: -5 },
    });
    expect(v.cleanup.intervalHours).toBeGreaterThanOrEqual(1);
    expect(v.cleanup.olderThanDays).toBeGreaterThanOrEqual(1);
  });

  it("drops malformed keyword entries", () => {
    const v = validateSettings({
      keywords: [
        { id: "1", value: "ok", enabled: true },
        { id: "2", value: 123, enabled: true },
        null,
        { id: "3", value: "", enabled: true },
      ],
    });
    expect(v.keywords.map((k) => k.id)).toEqual(["1"]);
  });
});

describe("isValidKeywordValue", () => {
  it("accepts non-empty after trim", () => {
    expect(isValidKeywordValue("foo")).toBe(true);
    expect(isValidKeywordValue("  foo  ")).toBe(true);
  });

  it("rejects empty / whitespace", () => {
    expect(isValidKeywordValue("")).toBe(false);
    expect(isValidKeywordValue("   ")).toBe(false);
  });
});

describe("addKeyword (immutable)", () => {
  it("returns a new settings object", () => {
    const next = addKeyword(DEFAULT_SETTINGS, "youtube");
    expect(next).not.toBe(DEFAULT_SETTINGS);
    expect(next.keywords).not.toBe(DEFAULT_SETTINGS.keywords);
    expect(DEFAULT_SETTINGS.keywords.length).toBe(0);
  });

  it("appends keyword with generated id, trimmed value, enabled=true", () => {
    const next = addKeyword(DEFAULT_SETTINGS, "  YouTube ");
    expect(next.keywords.length).toBe(1);
    expect(next.keywords[0]!.value).toBe("YouTube");
    expect(next.keywords[0]!.enabled).toBe(true);
    expect(next.keywords[0]!.id).toBeTruthy();
  });

  it("ignores empty/whitespace input", () => {
    const next = addKeyword(DEFAULT_SETTINGS, "   ");
    expect(next).toBe(DEFAULT_SETTINGS);
  });

  it("dedupes by normalized value (case-insensitive)", () => {
    const a = addKeyword(DEFAULT_SETTINGS, "youtube");
    const b = addKeyword(a, "YOUTUBE");
    expect(b.keywords.length).toBe(1);
  });
});

describe("removeKeyword", () => {
  it("removes by id immutably", () => {
    const a = addKeyword(DEFAULT_SETTINGS, "a");
    const b = addKeyword(a, "b");
    const id = b.keywords[0]!.id;
    const removed = removeKeyword(b, id);
    expect(removed.keywords.length).toBe(1);
    expect(b.keywords.length).toBe(2);
  });

  it("no-op on unknown id", () => {
    const a = addKeyword(DEFAULT_SETTINGS, "a");
    const same = removeKeyword(a, "nonexistent");
    expect(same.keywords).toEqual(a.keywords);
  });
});

describe("setKeywordEnabled", () => {
  it("toggles enabled by id", () => {
    const a = addKeyword(DEFAULT_SETTINGS, "a");
    const id = a.keywords[0]!.id;
    const off = setKeywordEnabled(a, id, false);
    expect(off.keywords[0]!.enabled).toBe(false);
    expect(a.keywords[0]!.enabled).toBe(true);
  });
});

describe("updateKeywordValue", () => {
  it("updates value, trimming, by id", () => {
    const a = addKeyword(DEFAULT_SETTINGS, "old");
    const id = a.keywords[0]!.id;
    const upd = updateKeywordValue(a, id, "  new  ");
    expect(upd.keywords[0]!.value).toBe("new");
  });

  it("rejects empty value (no-op)", () => {
    const a = addKeyword(DEFAULT_SETTINGS, "old");
    const id = a.keywords[0]!.id;
    const upd = updateKeywordValue(a, id, "   ");
    expect(upd).toBe(a);
  });
});

describe("exportKeywords", () => {
  it("produces a versioned payload with value/enabled only (no id)", () => {
    const a = addKeyword(DEFAULT_SETTINGS, "youtube.com");
    const b = addKeyword(a, "facebook.com");
    const off = setKeywordEnabled(b, b.keywords[0]!.id, false);

    const payload = exportKeywords(off, new Date("2026-05-19T12:00:00.000Z"));

    expect(payload.type).toBe("histsieve.keywords");
    expect(payload.version).toBe(1);
    expect(payload.exportedAt).toBe("2026-05-19T12:00:00.000Z");
    expect(payload.keywords).toEqual([
      { value: "youtube.com", enabled: false },
      { value: "facebook.com", enabled: true },
    ]);
  });

  it("handles empty keyword list", () => {
    const payload = exportKeywords(DEFAULT_SETTINGS);
    expect(payload.keywords).toEqual([]);
  });
});

describe("parseKeywordsExport", () => {
  it("parses a valid payload and assigns fresh ids", () => {
    const result = parseKeywordsExport({
      type: "histsieve.keywords",
      version: 1,
      exportedAt: "2026-05-19T12:00:00.000Z",
      keywords: [
        { value: "youtube.com", enabled: true },
        { value: "twitter.com", enabled: false },
      ],
    });

    expect(result.length).toBe(2);
    expect(result[0]!.value).toBe("youtube.com");
    expect(result[0]!.enabled).toBe(true);
    expect(result[0]!.id).toBeTruthy();
    expect(result[1]!.value).toBe("twitter.com");
    expect(result[1]!.enabled).toBe(false);
    expect(result[0]!.id).not.toBe(result[1]!.id);
  });

  it("defaults enabled to true when missing", () => {
    const result = parseKeywordsExport({
      type: "histsieve.keywords",
      version: 1,
      keywords: [{ value: "foo" }],
    });
    expect(result[0]!.enabled).toBe(true);
  });

  it("drops malformed entries silently", () => {
    const result = parseKeywordsExport({
      type: "histsieve.keywords",
      version: 1,
      keywords: [
        { value: "ok" },
        { value: "" },
        { value: "   " },
        null,
        "string",
        { enabled: true },
      ],
    });
    expect(result.map((k) => k.value)).toEqual(["ok"]);
  });

  it("throws on non-object input", () => {
    expect(() => parseKeywordsExport(null)).toThrow();
    expect(() => parseKeywordsExport("hi")).toThrow();
    expect(() => parseKeywordsExport(42)).toThrow();
  });

  it("throws on wrong type marker", () => {
    expect(() =>
      parseKeywordsExport({ type: "other.thing", version: 1, keywords: [] }),
    ).toThrow();
  });

  it("throws on unsupported version", () => {
    expect(() =>
      parseKeywordsExport({ type: "histsieve.keywords", version: 99, keywords: [] }),
    ).toThrow();
  });

  it("throws when keywords is missing or not an array", () => {
    expect(() =>
      parseKeywordsExport({ type: "histsieve.keywords", version: 1 }),
    ).toThrow();
    expect(() =>
      parseKeywordsExport({ type: "histsieve.keywords", version: 1, keywords: "x" }),
    ).toThrow();
  });
});

describe("mergeKeywords", () => {
  it("appends new entries and reports counts", () => {
    const base = addKeyword(DEFAULT_SETTINGS, "youtube.com");
    const incoming: Keyword[] = [
      { id: "x1", value: "facebook.com", enabled: true },
      { id: "x2", value: "twitter.com", enabled: false },
    ];
    const result = mergeKeywords(base, incoming);

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.next.keywords.length).toBe(3);
    expect(result.next.keywords.map((k) => k.value)).toEqual([
      "youtube.com",
      "facebook.com",
      "twitter.com",
    ]);
  });

  it("skips duplicates by normalized value (case-insensitive)", () => {
    const base = addKeyword(DEFAULT_SETTINGS, "YouTube.com");
    const incoming: Keyword[] = [
      { id: "x1", value: "youtube.com", enabled: false },
      { id: "x2", value: "twitter.com", enabled: true },
    ];
    const result = mergeKeywords(base, incoming);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.next.keywords.length).toBe(2);
    expect(result.next.keywords[0]!.value).toBe("YouTube.com");
    expect(result.next.keywords[0]!.enabled).toBe(true);
  });

  it("dedupes within the incoming batch itself", () => {
    const incoming: Keyword[] = [
      { id: "x1", value: "foo", enabled: true },
      { id: "x2", value: "FOO", enabled: false },
    ];
    const result = mergeKeywords(DEFAULT_SETTINGS, incoming);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("returns immutable result", () => {
    const incoming: Keyword[] = [{ id: "x1", value: "foo", enabled: true }];
    const result = mergeKeywords(DEFAULT_SETTINGS, incoming);
    expect(result.next).not.toBe(DEFAULT_SETTINGS);
    expect(result.next.keywords).not.toBe(DEFAULT_SETTINGS.keywords);
  });
});

describe("replaceKeywords", () => {
  it("replaces the keyword list entirely", () => {
    const base = addKeyword(DEFAULT_SETTINGS, "old");
    const incoming: Keyword[] = [
      { id: "x1", value: "new1", enabled: true },
      { id: "x2", value: "new2", enabled: false },
    ];
    const result = replaceKeywords(base, incoming);
    expect(result.keywords.length).toBe(2);
    expect(result.keywords.map((k) => k.value)).toEqual(["new1", "new2"]);
  });

  it("is immutable and preserves other settings", () => {
    const base = setCleanupConfig(DEFAULT_SETTINGS, { intervalHours: 12 });
    const result = replaceKeywords(base, []);
    expect(result).not.toBe(base);
    expect(result.cleanup.intervalHours).toBe(12);
    expect(result.keywords).toEqual([]);
  });
});

describe("setCleanupConfig", () => {
  it("returns a new settings object with merged cleanup", () => {
    const s: Settings = DEFAULT_SETTINGS;
    const next = setCleanupConfig(s, { intervalHours: 6 });
    expect(next.cleanup.intervalHours).toBe(6);
    expect(next.cleanup.scope).toBe(s.cleanup.scope);
    expect(next).not.toBe(s);
  });

  it("clamps invalid values", () => {
    const next = setCleanupConfig(DEFAULT_SETTINGS, { intervalHours: 0, olderThanDays: 0 });
    expect(next.cleanup.intervalHours).toBeGreaterThanOrEqual(1);
    expect(next.cleanup.olderThanDays).toBeGreaterThanOrEqual(1);
  });
});
