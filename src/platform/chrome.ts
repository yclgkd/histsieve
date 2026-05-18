import type { Settings } from "@/core/types";
import { DEFAULT_SETTINGS, validateSettings } from "@/core/settings";

const SETTINGS_KEY = "histsieve.settings.v1";

export type StorageArea = "sync" | "local";

const STORAGE_AREA: StorageArea = "sync";

function storage() {
  return chrome.storage[STORAGE_AREA];
}

export async function loadSettings(): Promise<Settings> {
  const result = await storage().get(SETTINGS_KEY);
  return validateSettings(result[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await storage().set({ [SETTINGS_KEY]: settings });
}

export function onSettingsChanged(handler: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== STORAGE_AREA) return;
    const change = changes[SETTINGS_KEY];
    if (!change) return;
    handler(validateSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function deleteHistoryUrl(url: string): Promise<void> {
  await chrome.history.deleteUrl({ url });
}

export async function deleteHistoryRange(startTime: number, endTime: number): Promise<void> {
  await chrome.history.deleteRange({ startTime, endTime });
}

export async function deleteAllHistory(): Promise<void> {
  await chrome.history.deleteAll();
}

export async function searchHistory(
  query: chrome.history.HistoryQuery,
): Promise<chrome.history.HistoryItem[]> {
  return chrome.history.search(query);
}

export async function createAlarm(name: string, periodInMinutes: number): Promise<void> {
  await chrome.alarms.create(name, { periodInMinutes });
}

export async function clearAlarm(name: string): Promise<void> {
  await chrome.alarms.clear(name);
}

export { SETTINGS_KEY, DEFAULT_SETTINGS };
