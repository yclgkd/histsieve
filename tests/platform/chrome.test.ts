import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Settings } from "@/core/types";

type AnyMock = Mock<any[], any>;

type ChromeMock = {
  storage: {
    sync: { get: AnyMock; set: AnyMock };
    onChanged: { addListener: AnyMock; removeListener: AnyMock };
  };
  history: {
    deleteUrl: AnyMock;
    deleteRange: AnyMock;
    deleteAll: AnyMock;
    search: AnyMock;
  };
  alarms: { create: AnyMock; clear: AnyMock };
};

const installChromeMock = (): ChromeMock => {
  const mock: ChromeMock = {
    storage: {
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    history: {
      deleteUrl: vi.fn(async () => {}),
      deleteRange: vi.fn(async () => {}),
      deleteAll: vi.fn(async () => {}),
      search: vi.fn(async () => []),
    },
    alarms: { create: vi.fn(async () => {}), clear: vi.fn(async () => {}) },
  };
  (globalThis as unknown as { chrome: ChromeMock }).chrome = mock;
  return mock;
};

let mock: ChromeMock;

beforeEach(async () => {
  vi.resetModules();
  mock = installChromeMock();
});

describe("platform/chrome", () => {
  it("loadSettings returns defaults on empty storage", async () => {
    const mod = await import("@/platform/chrome");
    const s = await mod.loadSettings();
    expect(s.enabled).toBe(true);
    expect(s.keywords).toEqual([]);
  });

  it("loadSettings parses stored value", async () => {
    const stored: Partial<Settings> = { enabled: false };
    mock.storage.sync.get.mockResolvedValueOnce({ "histsieve.settings.v1": stored });
    const mod = await import("@/platform/chrome");
    const s = await mod.loadSettings();
    expect(s.enabled).toBe(false);
  });

  it("saveSettings writes under the namespaced key", async () => {
    const mod = await import("@/platform/chrome");
    await mod.saveSettings({
      enabled: true,
      keywords: [],
      cleanup: {
        intervalEnabled: true,
        intervalHours: 24,
        onStartup: true,
        scope: "olderThan",
        olderThanDays: 30,
      },
      lastCleanAt: null,
    });
    expect(mock.storage.sync.set).toHaveBeenCalledTimes(1);
    const arg = mock.storage.sync.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(arg)).toEqual(["histsieve.settings.v1"]);
  });

  it("onSettingsChanged fires with validated settings", async () => {
    const mod = await import("@/platform/chrome");
    const handler = vi.fn();
    mod.onSettingsChanged(handler);
    expect(mock.storage.onChanged.addListener).toHaveBeenCalled();
    const listener = mock.storage.onChanged.addListener.mock.calls[0]![0] as (
      changes: Record<string, { newValue: unknown }>,
      area: string,
    ) => void;

    listener(
      { "histsieve.settings.v1": { newValue: { enabled: false } } },
      "sync",
    );
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].enabled).toBe(false);
  });

  it("onSettingsChanged ignores other areas and keys", async () => {
    const mod = await import("@/platform/chrome");
    const handler = vi.fn();
    mod.onSettingsChanged(handler);
    const listener = mock.storage.onChanged.addListener.mock.calls[0]![0] as (
      changes: Record<string, { newValue: unknown }>,
      area: string,
    ) => void;

    listener({ other: { newValue: 1 } }, "sync");
    listener({ "histsieve.settings.v1": { newValue: {} } }, "local");
    expect(handler).not.toHaveBeenCalled();
  });

  it("onSettingsChanged returns an unsubscribe fn", async () => {
    const mod = await import("@/platform/chrome");
    const off = mod.onSettingsChanged(() => {});
    off();
    expect(mock.storage.onChanged.removeListener).toHaveBeenCalledOnce();
  });

  it("history wrappers proxy to chrome.history", async () => {
    const mod = await import("@/platform/chrome");
    await mod.deleteHistoryUrl("https://x.com");
    expect(mock.history.deleteUrl).toHaveBeenCalledWith({ url: "https://x.com" });
    await mod.deleteHistoryRange(1, 2);
    expect(mock.history.deleteRange).toHaveBeenCalledWith({ startTime: 1, endTime: 2 });
    await mod.deleteAllHistory();
    expect(mock.history.deleteAll).toHaveBeenCalled();
    await mod.searchHistory({ text: "" });
    expect(mock.history.search).toHaveBeenCalledWith({ text: "" });
  });

  it("alarm wrappers proxy to chrome.alarms", async () => {
    const mod = await import("@/platform/chrome");
    await mod.createAlarm("a", 5);
    expect(mock.alarms.create).toHaveBeenCalledWith("a", { periodInMinutes: 5 });
    await mod.clearAlarm("a");
    expect(mock.alarms.clear).toHaveBeenCalledWith("a");
  });
});
