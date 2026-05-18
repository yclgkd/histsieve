import { matchesAnyKeyword } from "@/core/matcher";
import type { Settings } from "@/core/types";

export type VisitItem = {
  url: string;
  title?: string | null;
};

export type KeywordWatcherDeps = {
  getSettings: () => Settings | Promise<Settings>;
  deleteUrl: (url: string) => Promise<void>;
};

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export async function handleVisit(
  visit: VisitItem,
  deps: KeywordWatcherDeps,
): Promise<void> {
  if (!isHttpUrl(visit.url)) return;

  const settings = await deps.getSettings();
  if (!settings.enabled) return;
  if (settings.keywords.length === 0) return;

  if (!matchesAnyKeyword(visit.url, visit.title, settings.keywords)) return;

  try {
    await deps.deleteUrl(visit.url);
  } catch (err) {
    console.warn("[histsieve] failed to delete history url", visit.url, err);
  }
}
