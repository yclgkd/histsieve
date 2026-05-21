// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/core/types";

const messages: Record<string, string> = {
  btnCleanAll: "Delete all history",
  btnCleanOlder: "Delete entries older than $1$ days",
  btnConfirmAll: "Click again to confirm",
  popupCleaning: "Cleaning...",
  popupCleanedOk: "Done.",
  popupCleanedPartial: "Partly cleaned.",
  popupCleanedFail: "Cleanup failed.",
  popupNever: "Never",
  statusSaved: "Saved",
  statusSaveFailed: "Save failed.",
  hintClickToEdit: "Click to edit",
  btnDelete: "Delete",
  keywordDuplicate: "Keyword already exists.",
  importEmpty: "No valid keywords found in file.",
  importError: "Import failed: invalid file format.",
  importDoneMerge: "Imported $1$, skipped $2$.",
  importDoneReplace: "Replaced with $1$ keywords.",
};

const baseSettings = (): Settings => ({
  enabled: true,
  keywords: [
    { id: "youtube", value: "youtube.com", enabled: true },
    { id: "github", value: "github.com", enabled: true },
  ],
  cleanup: {
    intervalEnabled: true,
    intervalHours: 24,
    onStartup: true,
    scope: "olderThan",
    olderThanDays: 30,
  },
  lastCleanAt: null,
});

function setupChrome(): void {
  const getMessage = vi.fn((key: string, subs?: string | string[]) => {
    const template = messages[key] ?? key;
    const values = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
    return template.replace(/\$(\d+)\$/g, (_, index) => values[Number(index) - 1] ?? "");
  });
  (globalThis as unknown as { chrome: unknown }).chrome = {
    i18n: { getMessage, getUILanguage: vi.fn(() => "en-US") },
    runtime: { sendMessage: vi.fn(async () => ({ ok: true, sweepTruncated: false })) },
  };
}

function setupDom(): void {
  document.body.innerHTML = `
    <input id="enabled" type="checkbox" />
    <input id="intervalEnabled" type="checkbox" />
    <input id="intervalHours" type="number" />
    <input id="onStartup" type="checkbox" />
    <input type="radio" name="scope" value="olderThan" />
    <input type="radio" name="scope" value="all" />
    <input id="olderThanDays" type="number" />
    <span id="lastClean"></span>
    <span id="activeKwCount"></span>
    <button id="cleanNow" type="button"></button>
    <form id="kwForm"><input id="kwInput" /><button type="submit">Add</button></form>
    <button id="kwExport" type="button"></button>
    <button id="kwImport" type="button"></button>
    <input id="kwImportFile" type="file" />
    <ul id="kwList"></ul>
    <p id="kwEmpty" class="hidden"></p>
    <span id="appVersion"></span>
    <div id="saveStatus"><span id="saveStatusText"></span></div>
    <dialog id="importModeDialog"><p id="importModeMessage"></p></dialog>
  `;
}

async function loadOptions(initial: Settings): Promise<{
  emitStorageChange: (next: Settings) => void;
  saveSettings: ReturnType<typeof vi.fn>;
}> {
  let onChange: ((settings: Settings) => void) | null = null;
  const saveSettings = vi.fn(async (next: Settings) => {
    onChange?.(next);
  });

  vi.doMock("@/platform/chrome", () => ({
    loadSettings: vi.fn(async () => initial),
    saveSettings,
    onSettingsChanged: vi.fn((handler: (settings: Settings) => void) => {
      onChange = handler;
      return vi.fn();
    }),
  }));

  await import("@/ui/options/options");
  await vi.waitFor(() => expect(document.querySelectorAll("#kwList li")).toHaveLength(2));
  return {
    emitStorageChange: (next: Settings) => onChange?.(next),
    saveSettings,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("@/platform/chrome");
  document.body.innerHTML = "";
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

function setImportFile(content: string): void {
  const fileInput = document.querySelector<HTMLInputElement>("#kwImportFile")!;
  Object.defineProperty(fileInput, "files", {
    value: [{ text: async () => content }],
    configurable: true,
  });
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
}

// chooseImportMode awaits the <dialog>; jsdom has no real modal, so resolve it
// synchronously by closing the dialog with the chosen returnValue.
function stubImportMode(mode: "merge" | "replace"): void {
  const dialog = document.querySelector<HTMLDialogElement>("#importModeDialog")!;
  dialog.showModal = vi.fn(() => {
    dialog.returnValue = mode;
    dialog.dispatchEvent(new Event("close"));
  });
}

const exportFile = (keywords: { value: string; enabled: boolean }[]): string =>
  JSON.stringify({ type: "histsieve.keywords", version: 1, keywords });

describe("options page", () => {
  it("rerenders immediately after deleting a keyword saved by this page", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li button.danger")!.click();

    await vi.waitFor(() => expect(document.querySelectorAll("#kwList li")).toHaveLength(1));
    expect(document.querySelector("#activeKwCount")!.textContent).toBe("1");
    expect(saveSettings.mock.calls[0]![0].keywords.map((k: { value: string }) => k.value)).toEqual([
      "github.com",
    ]);
  });

  it("updates the active keyword count when a keyword is disabled", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());

    document.querySelector<HTMLInputElement>("#kwList li input[type='checkbox']")!.click();

    await vi.waitFor(() => expect(document.querySelector("#activeKwCount")!.textContent).toBe("1"));
    expect(document.querySelector("#kwList li")!.classList.contains("disabled")).toBe(true);
  });

  it("adds a new keyword from the form and rejects duplicates", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());
    const input = document.querySelector<HTMLInputElement>("#kwInput")!;
    const form = document.querySelector<HTMLFormElement>("#kwForm")!;

    input.value = "twitter.com";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.querySelectorAll("#kwList li")).toHaveLength(3));
    expect(document.querySelector("#activeKwCount")!.textContent).toBe("3");

    input.value = "YOUTUBE.com";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() =>
      expect(document.querySelector("#saveStatusText")!.textContent).toBe(
        "Keyword already exists.",
      ),
    );
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("rerenders cleanup inputs after sanitized values are saved", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());
    const intervalHours = document.querySelector<HTMLInputElement>("#intervalHours")!;

    intervalHours.value = "0";
    intervalHours.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(intervalHours.value).toBe("1"));
    expect(saveSettings.mock.calls[0]![0].cleanup.intervalHours).toBe(1);
  });

  it("rerenders when another extension context changes settings", async () => {
    setupChrome();
    setupDom();
    const initial = baseSettings();
    const { emitStorageChange } = await loadOptions(initial);

    emitStorageChange({
      ...initial,
      keywords: [{ id: "github", value: "github.com", enabled: false }],
    });

    await vi.waitFor(() => expect(document.querySelectorAll("#kwList li")).toHaveLength(1));
    expect(document.querySelector("#activeKwCount")!.textContent).toBe("0");
    expect(document.querySelector("#kwList li")!.classList.contains("disabled")).toBe(true);
  });

  it("shows import errors without saving invalid or empty files", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());
    const fileInput = document.querySelector<HTMLInputElement>("#kwImportFile")!;

    Object.defineProperty(fileInput, "files", {
      value: [{ text: async () => "not-json" }],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(document.querySelector("#saveStatusText")!.textContent).toBe(
        "Import failed: invalid file format.",
      ),
    );

    Object.defineProperty(fileInput, "files", {
      value: [
        {
          text: async () =>
            JSON.stringify({ type: "histsieve.keywords", version: 1, keywords: [] }),
        },
      ],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(document.querySelector("#saveStatusText")!.textContent).toBe(
        "No valid keywords found in file.",
      ),
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("merges imported keywords into the existing list", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());
    stubImportMode("merge");

    setImportFile(
      exportFile([
        { value: "reddit.com", enabled: true },
        { value: "youtube.com", enabled: true },
      ]),
    );

    await vi.waitFor(() => expect(document.querySelectorAll("#kwList li")).toHaveLength(3));
    expect(saveSettings.mock.calls[0]![0].keywords.map((k: { value: string }) => k.value)).toEqual([
      "youtube.com",
      "github.com",
      "reddit.com",
    ]);
    // one new keyword added, one duplicate skipped
    expect(document.querySelector("#saveStatusText")!.textContent).toBe("Imported 1, skipped 1.");
  });

  it("replaces the whole keyword list when replace mode is chosen", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());
    stubImportMode("replace");

    setImportFile(exportFile([{ value: "reddit.com", enabled: false }]));

    await vi.waitFor(() => expect(document.querySelectorAll("#kwList li")).toHaveLength(1));
    expect(saveSettings.mock.calls[0]![0].keywords.map((k: { value: string }) => k.value)).toEqual([
      "reddit.com",
    ]);
    expect(document.querySelector("#saveStatusText")!.textContent).toBe(
      "Replaced with 1 keywords.",
    );
  });

  it("exports the current keywords as a downloadable JSON file", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());

    const createObjectURL = vi.fn((_blob: Blob) => "blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    let downloadName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    document.querySelector<HTMLButtonElement>("#kwExport")!.click();

    // exportKeywords payload content is covered by settings.test.ts; here we
    // verify the download wiring: blob built, anchor clicked, object URL freed.
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob.type).toBe("application/json");
    expect(blob.size).toBeGreaterThan(0);
    expect(click).toHaveBeenCalledOnce();
    expect(downloadName).toMatch(/^histsieve-keywords-\d{8}\.json$/);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
