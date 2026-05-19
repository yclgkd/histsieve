import { describe, expect, it, vi } from "vitest";
import { createCleanupExecutor } from "@/background/cleanup-executor";
import { DEFAULT_SETTINGS, setCleanupConfig } from "@/core/settings";

const NOW = 1_700_000_000_000;

function makeDeps(overrides: Record<string, unknown> = {}) {
  let settings = setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 });
  return {
    getSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async (next: typeof settings) => {
      settings = next;
    }),
    deleteRange: vi.fn(async (_s: number, _e: number) => {}),
    deleteAll: vi.fn(async () => {}),
    searchHistory: vi.fn(async () => [] as chrome.history.HistoryItem[]),
    deleteUrl: vi.fn(async (_u: string) => {}),
    now: () => NOW,
    ...overrides,
  };
}

describe("createCleanupExecutor", () => {
  it("reuses the same in-flight cleanup for concurrent calls", async () => {
    let finishDeleteRange: () => void = () => {};
    const deps = makeDeps({
      deleteRange: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishDeleteRange = resolve;
          }),
      ),
    });
    const executeCleanup = createCleanupExecutor(deps);

    const first = executeCleanup();
    const second = executeCleanup();

    expect(second).toBe(first);
    await vi.waitFor(() => expect(deps.deleteRange).toHaveBeenCalledOnce());
    finishDeleteRange();
    await expect(first).resolves.toEqual({ cleanedAt: NOW, deletedByKeyword: 0 });
    await expect(second).resolves.toEqual({ cleanedAt: NOW, deletedByKeyword: 0 });
    expect(deps.saveSettings).toHaveBeenCalledOnce();
  });

  it("clears the in-flight cleanup after it settles", async () => {
    const deps = makeDeps();
    const executeCleanup = createCleanupExecutor(deps);

    await executeCleanup();
    await executeCleanup();

    expect(deps.deleteRange).toHaveBeenCalledTimes(2);
  });

  it("saves lastCleanAt on top of the latest settings", async () => {
    const firstSettings = setCleanupConfig(DEFAULT_SETTINGS, {
      scope: "olderThan",
      olderThanDays: 7,
    });
    const latestSettings = { ...firstSettings, enabled: false };
    const deps = makeDeps({
      getSettings: vi
        .fn()
        .mockResolvedValueOnce(firstSettings)
        .mockResolvedValueOnce(latestSettings),
    });
    const executeCleanup = createCleanupExecutor(deps);

    await executeCleanup();

    expect(deps.saveSettings).toHaveBeenCalledWith({ ...latestSettings, lastCleanAt: NOW });
  });
});
