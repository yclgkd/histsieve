import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, setCleanupConfig } from "@/core/settings";
import type { Settings } from "@/core/types";

const ALARM_NAME = "histsieve-cleanup";

type BackgroundListeners = {
  visited?: (item: chrome.history.HistoryItem) => void;
  installed?: (details: chrome.runtime.InstalledDetails) => Promise<void>;
  startup?: () => Promise<void>;
  alarm?: (alarm: chrome.alarms.Alarm) => Promise<void>;
  message?: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean;
};

type PlatformMocks = {
  loadSettings: ReturnType<typeof vi.fn>;
  saveSettings: ReturnType<typeof vi.fn>;
  deleteHistoryRange: ReturnType<typeof vi.fn>;
  deleteHistoryUrl: ReturnType<typeof vi.fn>;
  createAlarm: ReturnType<typeof vi.fn>;
  clearAlarm: ReturnType<typeof vi.fn>;
};

function installChromeListeners(listeners: BackgroundListeners): void {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    history: {
      onVisited: { addListener: vi.fn((cb) => (listeners.visited = cb)) },
    },
    runtime: {
      onInstalled: { addListener: vi.fn((cb) => (listeners.installed = cb)) },
      onStartup: { addListener: vi.fn((cb) => (listeners.startup = cb)) },
      onMessage: { addListener: vi.fn((cb) => (listeners.message = cb)) },
      openOptionsPage: vi.fn(),
    },
    alarms: {
      onAlarm: { addListener: vi.fn((cb) => (listeners.alarm = cb)) },
    },
  };
}

function mockPlatform(settings: Settings): PlatformMocks {
  const mocks: PlatformMocks = {
    loadSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async () => {}),
    deleteHistoryRange: vi.fn(async () => {}),
    deleteHistoryUrl: vi.fn(async () => {}),
    createAlarm: vi.fn(async () => {}),
    clearAlarm: vi.fn(async () => {}),
  };

  vi.doMock("@/platform/chrome", () => ({
    loadSettings: mocks.loadSettings,
    saveSettings: mocks.saveSettings,
    onSettingsChanged: vi.fn(() => vi.fn()),
    deleteAllHistory: vi.fn(async () => {}),
    deleteHistoryRange: mocks.deleteHistoryRange,
    deleteHistoryUrl: mocks.deleteHistoryUrl,
    searchHistory: vi.fn(async () => []),
    createAlarm: mocks.createAlarm,
    clearAlarm: mocks.clearAlarm,
  }));

  return mocks;
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/platform/chrome");
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("background entrypoint", () => {
  it("bootstraps alarms and runs startup cleanup when enabled", async () => {
    const listeners: BackgroundListeners = {};
    installChromeListeners(listeners);
    const settings = setCleanupConfig(DEFAULT_SETTINGS, { onStartup: true, intervalHours: 12 });
    const platform = mockPlatform(settings);

    await import("@/background/index");
    await listeners.startup?.();

    expect(platform.loadSettings).toHaveBeenCalledOnce();
    expect(platform.createAlarm).toHaveBeenCalledWith(ALARM_NAME, 720);
    expect(platform.deleteHistoryRange).toHaveBeenCalledOnce();
  });

  it("bootstraps alarms but skips startup cleanup when onStartup is off", async () => {
    const listeners: BackgroundListeners = {};
    installChromeListeners(listeners);
    const settings = setCleanupConfig(DEFAULT_SETTINGS, { onStartup: false });
    const platform = mockPlatform(settings);

    await import("@/background/index");
    await listeners.startup?.();

    expect(platform.createAlarm).toHaveBeenCalledOnce();
    expect(platform.deleteHistoryRange).not.toHaveBeenCalled();
  });

  it("logs and swallows scheduled cleanup failures", async () => {
    const listeners: BackgroundListeners = {};
    installChromeListeners(listeners);
    const platform = mockPlatform(DEFAULT_SETTINGS);
    platform.deleteHistoryRange.mockRejectedValueOnce(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("@/background/index");
    await expect(
      listeners.alarm?.({ name: ALARM_NAME } as chrome.alarms.Alarm),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith("[histsieve] scheduled cleanup failed", expect.any(Error));
    warn.mockRestore();
  });

  it("opens options on first install after bootstrapping alarms", async () => {
    const listeners: BackgroundListeners = {};
    installChromeListeners(listeners);
    const platform = mockPlatform(DEFAULT_SETTINGS);

    await import("@/background/index");
    await listeners.installed?.({ reason: "install" } as chrome.runtime.InstalledDetails);

    expect(platform.createAlarm).toHaveBeenCalledOnce();
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
  });

  it("bootstraps alarms without opening options on a non-install update", async () => {
    const listeners: BackgroundListeners = {};
    installChromeListeners(listeners);
    const platform = mockPlatform(DEFAULT_SETTINGS);

    await import("@/background/index");
    await listeners.installed?.({ reason: "update" } as chrome.runtime.InstalledDetails);

    expect(platform.createAlarm).toHaveBeenCalledOnce();
    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it("deletes newly visited matching urls and ignores empty history urls", async () => {
    const listeners: BackgroundListeners = {};
    installChromeListeners(listeners);
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      keywords: [{ id: "yt", value: "youtube", enabled: true }],
    };
    const platform = mockPlatform(settings);

    await import("@/background/index");
    listeners.visited?.({ id: "empty" } as chrome.history.HistoryItem);
    listeners.visited?.({
      id: "match",
      url: "https://youtube.com/watch",
      title: "Video",
    } as chrome.history.HistoryItem);

    await vi.waitFor(() =>
      expect(platform.deleteHistoryUrl).toHaveBeenCalledWith("https://youtube.com/watch"),
    );
    expect(platform.deleteHistoryUrl).toHaveBeenCalledOnce();
  });

  it("routes cleanNow messages through the cleanup executor", async () => {
    const listeners: BackgroundListeners = {};
    installChromeListeners(listeners);
    mockPlatform(DEFAULT_SETTINGS);
    const sendResponse = vi.fn();

    await import("@/background/index");
    const handled = listeners.message?.(
      { type: "histsieve.cleanNow" },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, deletedByKeyword: 0 }),
      ),
    );
  });
});
