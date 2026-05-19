import { matchesAnyKeyword } from "@/core/matcher";
import { ageCutoff } from "@/core/time";
import type { Settings } from "@/core/types";

export type CleanerDeps = {
  deleteAll: () => Promise<void>;
  deleteRange: (startTime: number, endTime: number) => Promise<void>;
  deleteUrl: (url: string) => Promise<void>;
  searchHistory: (query: chrome.history.HistoryQuery) => Promise<chrome.history.HistoryItem[]>;
  now: () => number;
};

export type CleanupResult = {
  cleanedAt: number | null;
  deletedByKeyword: number;
};

const SWEEP_MAX_RESULTS = 1000;

export async function runCleanup(settings: Settings, deps: CleanerDeps): Promise<CleanupResult> {
  if (!settings.enabled) {
    return { cleanedAt: null, deletedByKeyword: 0 };
  }

  const now = deps.now();

  if (settings.cleanup.scope === "all") {
    await deps.deleteAll();
    return { cleanedAt: now, deletedByKeyword: 0 };
  }

  const endTime = ageCutoff(now, settings.cleanup.olderThanDays);
  await deps.deleteRange(0, endTime);

  let deletedByKeyword = 0;
  if (settings.keywords.length > 0) {
    const items = await deps.searchHistory({
      text: "",
      startTime: endTime,
      endTime: now,
      maxResults: SWEEP_MAX_RESULTS,
    });
    for (const item of items) {
      if (!item.url) continue;
      if (!matchesAnyKeyword(item.url, item.title, settings.keywords)) continue;
      try {
        await deps.deleteUrl(item.url);
        deletedByKeyword += 1;
      } catch (err) {
        console.warn("[histsieve] sweep delete failed", item.url, err);
      }
    }
  }

  return { cleanedAt: now, deletedByKeyword };
}
