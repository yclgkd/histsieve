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

const SWEEP_PAGE_SIZE = 1000;
const HISTORY_TIME_EPSILON_MS = 0.001;

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

  const deletedByKeyword =
    settings.keywords.length > 0 ? await sweepKeywords(settings, deps, endTime, now) : 0;

  return { cleanedAt: now, deletedByKeyword };
}

async function sweepKeywords(
  settings: Settings,
  deps: CleanerDeps,
  startTime: number,
  endTime: number,
): Promise<number> {
  let deletedByKeyword = 0;
  let pageEndTime = endTime;

  while (pageEndTime >= startTime) {
    const items = await deps.searchHistory({
      text: "",
      startTime,
      endTime: pageEndTime,
      maxResults: SWEEP_PAGE_SIZE,
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

    if (items.length < SWEEP_PAGE_SIZE) break;
    const oldest = oldestVisitTime(items);
    if (oldest === null || oldest <= startTime) break;
    const nextEndTime = oldest - HISTORY_TIME_EPSILON_MS;
    if (nextEndTime >= pageEndTime) break;
    pageEndTime = nextEndTime;
  }

  return deletedByKeyword;
}

function oldestVisitTime(items: ReadonlyArray<chrome.history.HistoryItem>): number | null {
  let oldest: number | null = null;
  for (const item of items) {
    if (typeof item.lastVisitTime !== "number" || !Number.isFinite(item.lastVisitTime)) continue;
    oldest = oldest === null ? item.lastVisitTime : Math.min(oldest, item.lastVisitTime);
  }
  return oldest;
}
