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
let inFlightLoad: Promise<Settings> | null = null;

async function getSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  if (!inFlightLoad) {
    inFlightLoad = loadSettings().finally(() => {
      inFlightLoad = null;
    });
  }
  const loaded = await inFlightLoad;
  if (cachedSettings) return cachedSettings;
  cachedSettings = loaded;
  return loaded;
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

async function bootstrap(): Promise<Settings> {
  const settings = await loadSettings();
  cachedSettings = settings;
  await syncAlarms(settings, { createAlarm, clearAlarm });
  return settings;
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
  await bootstrap();
  if (details.reason === "install") {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await bootstrap();
  if (settings.cleanup.onStartup) {
    await executeCleanup();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    await executeCleanup();
  } catch (err) {
    console.warn("[histsieve] scheduled cleanup failed", err);
  }
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  return handleRuntimeMessage(message, { executeCleanup }, sendResponse);
});
