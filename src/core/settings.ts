import type { CleanupConfig, Keyword, Settings } from "./types";
import { normalizeKeywordValue } from "./matcher";

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  enabled: true,
  keywords: [],
  cleanup: Object.freeze({
    intervalEnabled: true,
    intervalHours: 24,
    onStartup: true,
    scope: "olderThan",
    olderThanDays: 30,
  }) as CleanupConfig,
  lastCleanAt: null,
}) as Settings;

const MIN_INTERVAL_HOURS = 1;
const MIN_DAYS = 1;

export function isValidKeywordValue(raw: unknown): raw is string {
  return typeof raw === "string" && raw.trim().length > 0;
}

function clampInt(n: unknown, min: number, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  const r = Math.floor(n);
  return r < min ? min : r;
}

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `kw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeKeyword(input: unknown): Keyword | null {
  if (input === null || typeof input !== "object") return null;
  const k = input as Record<string, unknown>;
  if (typeof k.id !== "string" || k.id.length === 0) return null;
  if (typeof k.value !== "string" || k.value.trim().length === 0) return null;
  return {
    id: k.id,
    value: k.value,
    enabled: typeof k.enabled === "boolean" ? k.enabled : true,
  };
}

function sanitizeCleanup(input: unknown): CleanupConfig {
  const def = DEFAULT_SETTINGS.cleanup;
  if (input === null || typeof input !== "object") return { ...def };
  const c = input as Partial<CleanupConfig>;
  return {
    intervalEnabled: typeof c.intervalEnabled === "boolean" ? c.intervalEnabled : def.intervalEnabled,
    intervalHours: clampInt(c.intervalHours, MIN_INTERVAL_HOURS, def.intervalHours),
    onStartup: typeof c.onStartup === "boolean" ? c.onStartup : def.onStartup,
    scope: c.scope === "all" || c.scope === "olderThan" ? c.scope : def.scope,
    olderThanDays: clampInt(c.olderThanDays, MIN_DAYS, def.olderThanDays),
  };
}

export function validateSettings(input: unknown): Settings {
  if (input === null || input === undefined || typeof input !== "object") {
    return cloneDefaults();
  }
  const s = input as Partial<Settings>;
  const keywordsRaw = Array.isArray(s.keywords) ? s.keywords : [];
  const keywords = keywordsRaw
    .map(sanitizeKeyword)
    .filter((k): k is Keyword => k !== null);

  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULT_SETTINGS.enabled,
    keywords,
    cleanup: sanitizeCleanup(s.cleanup),
    lastCleanAt:
      typeof s.lastCleanAt === "number" && Number.isFinite(s.lastCleanAt) ? s.lastCleanAt : null,
  };
}

function cloneDefaults(): Settings {
  return {
    enabled: DEFAULT_SETTINGS.enabled,
    keywords: [],
    cleanup: { ...DEFAULT_SETTINGS.cleanup },
    lastCleanAt: DEFAULT_SETTINGS.lastCleanAt,
  };
}

export function addKeyword(settings: Settings, value: string): Settings {
  const trimmed = value.trim();
  if (trimmed.length === 0) return settings;

  const normalizedNew = normalizeKeywordValue(trimmed);
  const exists = settings.keywords.some(
    (k) => normalizeKeywordValue(k.value) === normalizedNew,
  );
  if (exists) return settings;

  const newKeyword: Keyword = {
    id: generateId(),
    value: trimmed,
    enabled: true,
  };
  return { ...settings, keywords: [...settings.keywords, newKeyword] };
}

export function removeKeyword(settings: Settings, id: string): Settings {
  const next = settings.keywords.filter((k) => k.id !== id);
  if (next.length === settings.keywords.length) return settings;
  return { ...settings, keywords: next };
}

export function setKeywordEnabled(settings: Settings, id: string, enabled: boolean): Settings {
  const next = settings.keywords.map((k) => (k.id === id ? { ...k, enabled } : k));
  return { ...settings, keywords: next };
}

export function updateKeywordValue(settings: Settings, id: string, value: string): Settings {
  const trimmed = value.trim();
  if (trimmed.length === 0) return settings;
  const next = settings.keywords.map((k) => (k.id === id ? { ...k, value: trimmed } : k));
  return { ...settings, keywords: next };
}

export function setCleanupConfig(
  settings: Settings,
  patch: Partial<CleanupConfig>,
): Settings {
  const merged = sanitizeCleanup({ ...settings.cleanup, ...patch });
  return { ...settings, cleanup: merged };
}

export function withLastCleanAt(settings: Settings, ts: number): Settings {
  return { ...settings, lastCleanAt: ts };
}

export const KEYWORDS_EXPORT_TYPE = "histsieve.keywords";
export const KEYWORDS_EXPORT_VERSION = 1;

export type KeywordsExport = {
  type: typeof KEYWORDS_EXPORT_TYPE;
  version: typeof KEYWORDS_EXPORT_VERSION;
  exportedAt: string;
  keywords: ReadonlyArray<{ value: string; enabled: boolean }>;
};

export type MergeResult = {
  next: Settings;
  added: number;
  skipped: number;
};

export function exportKeywords(settings: Settings, now: Date = new Date()): KeywordsExport {
  return {
    type: KEYWORDS_EXPORT_TYPE,
    version: KEYWORDS_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    keywords: settings.keywords.map((k) => ({ value: k.value, enabled: k.enabled })),
  };
}

function sanitizeImportedKeyword(input: unknown): Keyword | null {
  if (input === null || typeof input !== "object") return null;
  const k = input as Record<string, unknown>;
  if (typeof k.value !== "string" || k.value.trim().length === 0) return null;
  return {
    id: generateId(),
    value: k.value.trim(),
    enabled: typeof k.enabled === "boolean" ? k.enabled : true,
  };
}

export function parseKeywordsExport(raw: unknown): Keyword[] {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Invalid file: expected a JSON object.");
  }
  const payload = raw as Record<string, unknown>;
  if (payload.type !== KEYWORDS_EXPORT_TYPE) {
    throw new Error("Invalid file: not a HistSieve keywords export.");
  }
  if (payload.version !== KEYWORDS_EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${String(payload.version)}.`);
  }
  if (!Array.isArray(payload.keywords)) {
    throw new Error("Invalid file: missing keywords array.");
  }
  return payload.keywords
    .map(sanitizeImportedKeyword)
    .filter((k): k is Keyword => k !== null);
}

export function mergeKeywords(settings: Settings, incoming: ReadonlyArray<Keyword>): MergeResult {
  const seen = new Set(settings.keywords.map((k) => normalizeKeywordValue(k.value)));
  const added: Keyword[] = [];
  let skipped = 0;

  for (const kw of incoming) {
    const norm = normalizeKeywordValue(kw.value);
    if (seen.has(norm)) {
      skipped += 1;
      continue;
    }
    seen.add(norm);
    added.push(kw);
  }

  if (added.length === 0) {
    return { next: settings, added: 0, skipped };
  }
  return {
    next: { ...settings, keywords: [...settings.keywords, ...added] },
    added: added.length,
    skipped,
  };
}

export function replaceKeywords(settings: Settings, incoming: ReadonlyArray<Keyword>): Settings {
  return { ...settings, keywords: [...incoming] };
}
