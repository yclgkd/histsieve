import type { Keyword } from "./types";

export function normalizeKeywordValue(raw: string): string {
  return raw.trim().toLowerCase();
}

export function compileKeywords(keywords: ReadonlyArray<Keyword>): string[] {
  const needles: string[] = [];
  for (const keyword of keywords) {
    if (!keyword.enabled) continue;
    const needle = normalizeKeywordValue(keyword.value);
    if (needle.length === 0) continue;
    needles.push(needle);
  }
  return needles;
}

export function matchesAnyNeedle(
  url: string,
  title: string | null | undefined,
  needles: ReadonlyArray<string>,
): boolean {
  if (needles.length === 0) return false;
  const haystack = `${url}\n${title ?? ""}`.toLowerCase();
  for (const needle of needles) {
    if (haystack.includes(needle)) return true;
  }
  return false;
}

export function matchesAnyKeyword(
  url: string,
  title: string | null | undefined,
  keywords: ReadonlyArray<Keyword>,
): boolean {
  return matchesAnyNeedle(url, title, compileKeywords(keywords));
}
