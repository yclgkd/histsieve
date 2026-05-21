import { describe, expect, it, vi } from "vitest";
import { MAX_SWEEP_ITEMS, runCleanup, SWEEP_PAGE_SIZE } from "@/background/cleaner";
import { addKeyword, DEFAULT_SETTINGS, setCleanupConfig } from "@/core/settings";
import { daysToMs } from "@/core/time";

const NOW = 1_700_000_000_000;

function makeDeps(overrides: Partial<Parameters<typeof runCleanup>[1]> = {}) {
  return {
    deleteRange: vi.fn(async (_s: number, _e: number) => {}),
    deleteAll: vi.fn(async () => {}),
    searchHistory: vi.fn(async () => [] as chrome.history.HistoryItem[]),
    deleteUrl: vi.fn(async (_u: string) => {}),
    now: () => NOW,
    ...overrides,
  };
}

describe("runCleanup — scope: all", () => {
  it("calls deleteAll", async () => {
    const s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" });
    const deps = makeDeps();
    const result = await runCleanup(s, deps);
    expect(deps.deleteAll).toHaveBeenCalledOnce();
    expect(deps.deleteRange).not.toHaveBeenCalled();
    expect(result.cleanedAt).toBe(NOW);
  });

  it("skips the keyword sweep when scope=all because deleteAll already wiped everything", async () => {
    const s = addKeyword(setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }), "youtube");
    const deps = makeDeps();
    await runCleanup(s, deps);
    expect(deps.deleteAll).toHaveBeenCalledOnce();
    expect(deps.searchHistory).not.toHaveBeenCalled();
    expect(deps.deleteUrl).not.toHaveBeenCalled();
  });
});

describe("runCleanup — scope: olderThan", () => {
  it("calls deleteRange with start=0, end=now - days*ms", async () => {
    const s = setCleanupConfig(DEFAULT_SETTINGS, {
      scope: "olderThan",
      olderThanDays: 7,
    });
    const deps = makeDeps();
    await runCleanup(s, deps);
    expect(deps.deleteAll).not.toHaveBeenCalled();
    expect(deps.deleteRange).toHaveBeenCalledWith(0, NOW - daysToMs(7));
  });

  it("sweeps remaining history for keyword matches and deletes them", async () => {
    const s = addKeyword(
      setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 }),
      "youtube",
    );
    const deps = makeDeps({
      searchHistory: vi.fn(async () => [
        { url: "https://youtube.com/a", title: "vid", id: "1", lastVisitTime: NOW },
        { url: "https://github.com/x", title: "code", id: "2", lastVisitTime: NOW },
      ]),
    });
    await runCleanup(s, deps);
    expect(deps.deleteUrl).toHaveBeenCalledWith("https://youtube.com/a");
    expect(deps.deleteUrl).not.toHaveBeenCalledWith("https://github.com/x");
  });

  it("continues keyword sweep beyond the first history search page", async () => {
    const s = addKeyword(
      setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 }),
      "target",
    );
    const firstPage: chrome.history.HistoryItem[] = Array.from(
      { length: SWEEP_PAGE_SIZE },
      (_, i) => ({
        url: `https://example.com/${i}`,
        title: "",
        id: `old-${i}`,
        lastVisitTime: NOW - i,
      }),
    );
    const secondPage: chrome.history.HistoryItem[] = [
      {
        url: "https://target.example/watch",
        title: "",
        id: "target",
        lastVisitTime: NOW - SWEEP_PAGE_SIZE,
      },
    ];
    const searchHistory = vi
      .fn<Parameters<typeof runCleanup>[1]["searchHistory"]>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const deps = makeDeps({ searchHistory });

    await runCleanup(s, deps);

    expect(searchHistory).toHaveBeenCalledTimes(2);
    expect(searchHistory.mock.calls[0]![0]).toMatchObject({
      startTime: NOW - daysToMs(7),
      endTime: NOW,
      maxResults: SWEEP_PAGE_SIZE,
    });
    const secondQuery = searchHistory.mock.calls[1]![0];
    expect(secondQuery.startTime).toBe(NOW - daysToMs(7));
    expect(secondQuery.endTime).toBeLessThan(firstPage.at(-1)!.lastVisitTime!);
    expect(deps.deleteUrl).toHaveBeenCalledWith("https://target.example/watch");
  });

  it("does not sweep when there are no keywords", async () => {
    const s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 });
    const deps = makeDeps({
      searchHistory: vi.fn(async () => [
        { url: "https://github.com/x", title: "", id: "2", lastVisitTime: NOW },
      ]),
    });
    await runCleanup(s, deps);
    expect(deps.searchHistory).not.toHaveBeenCalled();
    expect(deps.deleteUrl).not.toHaveBeenCalled();
  });
});

describe("runCleanup — keyword sweep result", () => {
  it("returns the number of keyword-matched urls deleted", async () => {
    const s = addKeyword(
      setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 }),
      "match",
    );
    const deps = makeDeps({
      searchHistory: vi.fn(async () => [
        { url: "https://match.com/a", title: "", id: "1", lastVisitTime: NOW },
        { url: "https://other.com/b", title: "", id: "2", lastVisitTime: NOW },
        { url: "https://match.com/c", title: "", id: "3", lastVisitTime: NOW },
      ]),
    });
    const result = await runCleanup(s, deps);
    expect(result.deletedByKeyword).toBe(2);
    expect(result.sweepTruncated).toBe(false);
  });

  it("deletes every match when matches exceed the delete concurrency limit", async () => {
    const s = addKeyword(
      setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 }),
      "match",
    );
    const page: chrome.history.HistoryItem[] = Array.from({ length: 130 }, (_, i) => ({
      url: `https://match.com/${i}`,
      title: "",
      id: `m-${i}`,
      lastVisitTime: NOW - i,
    }));
    const deps = makeDeps({ searchHistory: vi.fn(async () => page) });

    const result = await runCleanup(s, deps);

    expect(deps.deleteUrl).toHaveBeenCalledTimes(130);
    expect(result.deletedByKeyword).toBe(130);
    expect(result.sweepTruncated).toBe(false);
  });

  it("stops scanning once MAX_SWEEP_ITEMS is reached", async () => {
    const s = addKeyword(
      setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 3650 }),
      "nomatch",
    );
    let page = 0;
    const searchHistory = vi.fn(async () => {
      const base = page * SWEEP_PAGE_SIZE;
      page += 1;
      return Array.from({ length: SWEEP_PAGE_SIZE }, (_, i) => ({
        url: `https://example.com/${base + i}`,
        title: "",
        id: `e-${base + i}`,
        lastVisitTime: NOW - (base + i),
      }));
    });
    const deps = makeDeps({ searchHistory });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runCleanup(s, deps);
    warn.mockRestore();

    expect(searchHistory).toHaveBeenCalledTimes(MAX_SWEEP_ITEMS / SWEEP_PAGE_SIZE);
    expect(result.sweepTruncated).toBe(true);
    expect(result.cleanedAt).toBe(NOW);
  });
});

describe("runCleanup — disabled", () => {
  it("returns without calling anything when settings.enabled=false", async () => {
    const s = { ...DEFAULT_SETTINGS, enabled: false };
    const deps = makeDeps();
    const result = await runCleanup(s, deps);
    expect(deps.deleteAll).not.toHaveBeenCalled();
    expect(deps.deleteRange).not.toHaveBeenCalled();
    expect(result.cleanedAt).toBeNull();
  });
});

describe("runCleanup — error tolerance", () => {
  it("continues sweep even if some deletes fail", async () => {
    const s = addKeyword(
      setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 }),
      "youtube",
    );
    let calls = 0;
    const deps = makeDeps({
      searchHistory: vi.fn(async () => [
        { url: "https://youtube.com/a", title: "", id: "1", lastVisitTime: NOW },
        { url: "https://youtube.com/b", title: "", id: "2", lastVisitTime: NOW },
      ]),
      deleteUrl: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("boom");
      }),
    });
    const result = await runCleanup(s, deps);

    expect(deps.deleteUrl).toHaveBeenCalledTimes(2);
    expect(result.deletedByKeyword).toBe(1);
    expect(result.sweepTruncated).toBe(false);
  });
});
