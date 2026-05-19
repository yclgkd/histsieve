import {
  createAlarm,
  clearAlarm,
  deleteAllHistory,
  deleteHistoryRange,
  deleteHistoryUrl,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  searchHistory,
} from "@/platform/chrome";
import { handleVisit } from "./keyword-watcher";
import { runCleanup } from "./cleaner";
import { ALARM_NAME, syncAlarms } from "./scheduler";
import type { Settings } from "@/core/types";
import { withLastCleanAt } from "@/core/settings";

let cachedSettings: Settings | null = null;

async function getSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  cachedSettings = await loadSettings();
  return cachedSettings;
}

onSettingsChanged((next) => {
  cachedSettings = next;
  void syncAlarms(next, { createAlarm, clearAlarm });
});

chrome.history.onVisited.addListener((item) => {
  if (!item.url) return;
  void handleVisit(
    { url: item.url, title: item.title },
    {
      getSettings,
      deleteUrl: deleteHistoryUrl,
    },
  );
});

chrome.runtime.onInstalled.addListener(async (details) => {
  cachedSettings = await loadSettings();
  await syncAlarms(cachedSettings, { createAlarm, clearAlarm });
  if (details.reason === "install") {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  cachedSettings = await loadSettings();
  await syncAlarms(cachedSettings, { createAlarm, clearAlarm });
  if (cachedSettings.cleanup.onStartup) {
    await executeCleanup();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await executeCleanup();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRequest(message)) return false;
  if (message.type === "histsieve.cleanNow") {
    void executeCleanup().then((result) => sendResponse({ ok: true, ...result }));
    return true;
  }
  return false;
});

async function executeCleanup(): Promise<{ cleanedAt: number | null; deletedByKeyword: number }> {
  const settings = await getSettings();
  const result = await runCleanup(settings, {
    deleteAll: deleteAllHistory,
    deleteRange: deleteHistoryRange,
    deleteUrl: deleteHistoryUrl,
    searchHistory,
    now: () => Date.now(),
  });
  if (result.cleanedAt !== null) {
    const updated = withLastCleanAt(settings, result.cleanedAt);
    cachedSettings = updated;
    await saveSettings(updated);
  }
  return result;
}

type Request = { type: "histsieve.cleanNow" };

function isRequest(value: unknown): value is Request {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
