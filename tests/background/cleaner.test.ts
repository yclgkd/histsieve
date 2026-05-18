import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCleanup } from "@/background/cleaner";
import { DEFAULT_SETTINGS, addKeyword, setCleanupConfig } from "@/core/settings";
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
    await expect(runCleanup(s, deps)).resolves.toBeDefined();
    expect(deps.deleteUrl).toHaveBeenCalledTimes(2);
  });
});
