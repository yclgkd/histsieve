// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/core/types";

const settings: Settings = {
  enabled: true,
  keywords: [{ id: "kw-1", value: "youtube.com", enabled: true }],
  cleanup: {
    intervalEnabled: true,
    intervalHours: 24,
    onStartup: true,
    scope: "olderThan",
    olderThanDays: 30,
  },
  lastCleanAt: null,
};

const messages: Record<string, string> = {
  btnCleanAll: "Delete all browser history",
  btnCleanOlder: "Delete history older than $1$ days",
  btnConfirmAll: "Click again to confirm",
  popupCleaning: "Cleaning...",
  popupCleanedOk: "Done.",
  popupCleanedPartial: "Partly cleaned.",
  popupCleanedFail: "Cleanup failed.",
  popupNever: "Not yet",
};

function setupDom(): void {
  document.body.innerHTML = `
    <input id="enabled" type="checkbox" />
    <span id="kwCount"></span>
    <span id="lastClean"></span>
    <button id="cleanNow" type="button"></button>
    <button id="openOptions" type="button"></button>
  `;
}

function setupChrome(sendMessage = vi.fn(async () => ({ ok: true, sweepTruncated: true }))): void {
  const getMessage = vi.fn((key: string, subs?: string | string[]) => {
    const template = messages[key] ?? key;
    const values = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
    return template.replace(/\$(\d+)\$/g, (_, index) => values[Number(index) - 1] ?? "");
  });
  (globalThis as unknown as { chrome: unknown }).chrome = {
    i18n: { getMessage, getUILanguage: vi.fn(() => "en-US") },
    runtime: { sendMessage, openOptionsPage: vi.fn() },
  };
}

async function loadPopup(): Promise<{
  emitStorageChange: (next: Settings) => void;
  saveSettings: ReturnType<typeof vi.fn>;
}> {
  let onChange: ((settings: Settings) => void) | null = null;
  const saveSettings = vi.fn(async () => {});
  vi.doMock("@/platform/chrome", () => ({
    loadSettings: vi.fn(async () => settings),
    saveSettings,
    onSettingsChanged: vi.fn((handler: (next: Settings) => void) => {
      onChange = handler;
      return vi.fn();
    }),
  }));
  await import("@/ui/popup/popup");
  await vi.waitFor(() => expect(document.querySelector("#kwCount")!.textContent).toBe("1"));
  return {
    emitStorageChange: (next: Settings) => onChange?.(next),
    saveSettings,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/platform/chrome");
  document.body.innerHTML = "";
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("popup page", () => {
  it("passes truncated cleanup responses through to the clean button", async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, sweepTruncated: true }));
    setupChrome(sendMessage);
    setupDom();
    await loadPopup();

    document.querySelector<HTMLButtonElement>("#cleanNow")!.click();

    await vi.waitFor(() =>
      expect(document.querySelector("#cleanNow")!.textContent).toBe("Partly cleaned."),
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "histsieve.cleanNow" });
  });

  it("saves enable toggle changes", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadPopup();
    const enabled = document.querySelector<HTMLInputElement>("#enabled")!;

    enabled.checked = false;
    enabled.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledOnce());
    expect(saveSettings.mock.calls[0]![0].enabled).toBe(false);
  });

  it("opens the options page from the settings button", async () => {
    setupChrome();
    setupDom();
    await loadPopup();

    document.querySelector<HTMLButtonElement>("#openOptions")!.click();

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
  });

  it("rerenders when stored settings change", async () => {
    setupChrome();
    setupDom();
    const { emitStorageChange } = await loadPopup();

    emitStorageChange({ ...settings, enabled: false, keywords: [] });

    expect(document.querySelector<HTMLInputElement>("#enabled")!.checked).toBe(false);
    expect(document.querySelector("#kwCount")!.textContent).toBe("0");
  });
});
