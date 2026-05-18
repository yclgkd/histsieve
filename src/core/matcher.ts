import type { Keyword } from "./types";

export function normalizeKeywordValue(raw: string): string {
  return raw.trim().toLowerCase();
}

export function matchesAnyKeyword(
  url: string,
  title: string | null | undefined,
  keywords: ReadonlyArray<Keyword>,
): boolean {
  if (keywords.length === 0) return false;

  const haystack = `${url}\n${title ?? ""}`.toLowerCase();

  for (const keyword of keywords) {
    if (!keyword.enabled) continue;
    const needle = normalizeKeywordValue(keyword.value);
    if (needle.length === 0) continue;
    if (haystack.includes(needle)) return true;
  }

  return false;
}
