import type { Settings } from "@/core/types";
import {
  clearAlarm,
  createAlarm,
  deleteAllHistory,
  deleteHistoryRange,
  deleteHistoryUrl,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  searchHistory,
} from "@/platform/chrome";
import { createCleanupExecutor } from "./cleanup-executor";
import { handleVisit } from "./keyword-watcher";
import { handleRuntimeMessage } from "./messages";
import { ALARM_NAME, syncAlarms } from "./scheduler";

let cachedSettings: Settings | null = null;

async function getSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  cachedSettings = await loadSettings();
  return cachedSettings;
}

const executeCleanup = createCleanupExecutor({
  getSettings,
  saveSettings,
  setCachedSettings: (settings) => {
    cachedSettings = settings;
  },
  deleteAll: deleteAllHistory,
  deleteRange: deleteHistoryRange,
  deleteUrl: deleteHistoryUrl,
  searchHistory,
  now: () => Date.now(),
});

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
  return handleRuntimeMessage(message, { executeCleanup }, sendResponse);
});
