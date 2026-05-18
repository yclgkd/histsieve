export function formatTimestamp(ts: number | null, locale: string, fallback: string): string {
  if (ts === null || !Number.isFinite(ts)) return fallback;
  try {
    return new Date(ts).toLocaleString(locale);
  } catch {
    return new Date(ts).toISOString();
  }
}
