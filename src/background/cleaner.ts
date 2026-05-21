import { compileKeywords, matchesAnyNeedle } from "@/core/matcher";
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
  // True when the keyword sweep hit MAX_SWEEP_ITEMS and stopped before
  // scanning the whole retained window — i.e. cleanup is incomplete.
  sweepTruncated: boolean;
};

export const SWEEP_PAGE_SIZE = 1000;
// Hard cap to keep the MV3 service worker from running unbounded across pages.
export const MAX_SWEEP_ITEMS = 50_000;
// Number of deleteUrl calls to keep in flight at once.
const DELETE_CONCURRENCY = 50;
// Chrome's history.search uses endTime as an inclusive upper bound on visit time.
// Visit times are millisecond epoch with sub-ms precision, so a small negative
// nudge is enough to advance past the oldest item we just processed.
const HISTORY_TIME_EPSILON_MS = 0.001;

export async function runCleanup(settings: Settings, deps: CleanerDeps): Promise<CleanupResult> {
  if (!settings.enabled) {
    return { cleanedAt: null, deletedByKeyword: 0, sweepTruncated: false };
  }

  const now = deps.now();

  if (settings.cleanup.scope === "all") {
    await deps.deleteAll();
    return { cleanedAt: now, deletedByKeyword: 0, sweepTruncated: false };
  }

  const cutoff = ageCutoff(now, settings.cleanup.olderThanDays);
  await deps.deleteRange(0, cutoff);

  const needles = compileKeywords(settings.keywords);
  const sweep =
    needles.length > 0
      ? await sweepKeywords(deps, needles, cutoff, now)
      : { deleted: 0, truncated: false };

  return { cleanedAt: now, deletedByKeyword: sweep.deleted, sweepTruncated: sweep.truncated };
}

type SweepResult = { deleted: number; truncated: boolean };

async function sweepKeywords(
  deps: CleanerDeps,
  needles: ReadonlyArray<string>,
  sweepStart: number,
  sweepEnd: number,
): Promise<SweepResult> {
  let deleted = 0;
  let scanned = 0;
  let pageEndTime = sweepEnd;

  while (pageEndTime >= sweepStart) {
    if (scanned >= MAX_SWEEP_ITEMS) {
      console.warn("[histsieve] sweep hit MAX_SWEEP_ITEMS cap, stopping early", { scanned });
      return { deleted, truncated: true };
    }
    const items = await deps.searchHistory({
      text: "",
      startTime: sweepStart,
      endTime: pageEndTime,
      maxResults: SWEEP_PAGE_SIZE,
    });

    const matches: string[] = [];
    for (const item of items) {
      if (!item.url) continue;
      if (!matchesAnyNeedle(item.url, item.title, needles)) continue;
      matches.push(item.url);
    }
    scanned += items.length;

    deleted += await deleteUrls(deps, matches);

    if (items.length < SWEEP_PAGE_SIZE) break;
    const oldest = oldestVisitTime(items);
    if (oldest === null || oldest <= sweepStart) break;
    const nextEndTime = oldest - HISTORY_TIME_EPSILON_MS;
    if (nextEndTime >= pageEndTime) break;
    pageEndTime = nextEndTime;
  }

  return { deleted, truncated: false };
}

async function deleteUrls(deps: CleanerDeps, urls: ReadonlyArray<string>): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < urls.length; i += DELETE_CONCURRENCY) {
    const chunk = urls.slice(i, i + DELETE_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((url) => deps.deleteUrl(url)));
    for (const r of results) {
      if (r.status === "fulfilled") {
        deleted += 1;
      } else {
        console.warn("[histsieve] sweep delete failed", r.reason);
      }
    }
  }
  return deleted;
}

function oldestVisitTime(items: ReadonlyArray<chrome.history.HistoryItem>): number | null {
  let oldest: number | null = null;
  for (const item of items) {
    if (typeof item.lastVisitTime !== "number" || !Number.isFinite(item.lastVisitTime)) continue;
    oldest = oldest === null ? item.lastVisitTime : Math.min(oldest, item.lastVisitTime);
  }
  return oldest;
}
