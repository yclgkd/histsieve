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
  keywordToggleLabel: "Enable keyword: $1$",
  keywordEditLabel: "Edit keyword: $1$",
  keywordHiddenEditLabel: "Edit hidden keyword",
  keywordDeleteLabel: "Delete keyword: $1$",
  keywordEditInputLabel: "Keyword value",
  btnShowKeywords: "Show keywords",
  btnHideKeywords: "Hide keywords",
  btnDelete: "Delete",
  keywordDuplicate: "Keyword already exists.",
  keywordInvalid: "Keyword must be 1-200 characters.",
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
    <p id="kwError"></p>
    <button id="kwPrivacyToggle" type="button"></button>
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
  vi.useRealTimers();
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

function clickAfterPotentialInputBlur(control: HTMLElement, input: HTMLInputElement): void {
  const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  control.dispatchEvent(down);
  if (!down.defaultPrevented) {
    input.dispatchEvent(new FocusEvent("blur", { bubbles: false, relatedTarget: control }));
  }
  control.click();
}

describe("options page", () => {
  it("rerenders immediately after deleting a keyword saved by this page", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.click();
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

    document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.click();
    document.querySelector<HTMLInputElement>("#kwList li input[type='checkbox']")!.click();

    await vi.waitFor(() => expect(document.querySelector("#activeKwCount")!.textContent).toBe("1"));
    expect(document.querySelector("#kwList li")!.classList.contains("disabled")).toBe(true);
  });

  it("renders keyword controls with accessible names", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.click();

    const firstRow = document.querySelector<HTMLLIElement>("#kwList li")!;
    expect(firstRow.querySelector<HTMLInputElement>("input[type='checkbox']")!.ariaLabel).toBe(
      "Enable keyword: youtube.com",
    );
    expect(firstRow.querySelector<HTMLButtonElement>(".keyword-value")!.ariaLabel).toBe(
      "Edit keyword: youtube.com",
    );
    expect(firstRow.querySelector<HTMLButtonElement>("button.danger")!.ariaLabel).toBe(
      "Delete keyword: youtube.com",
    );
  });

  it("hides keyword values by default until they are revealed", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());

    const toggle = document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!;
    const keywordValues = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("#kwList li .keyword-value")).map(
        (button) => button.textContent,
      );

    expect(keywordValues()).toEqual(["••••••", "••••••"]);
    expect(toggle.textContent).toBe("Show keywords");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.ariaLabel).toBe(
      "Edit hidden keyword",
    );
    expect(document.querySelector("#kwList li input[type='checkbox']")).toBeNull();
    expect(document.querySelector("#kwList li button.danger")).toBeNull();

    toggle.click();

    await vi.waitFor(() => expect(keywordValues()).toEqual(["youtube.com", "github.com"]));
    expect(toggle.textContent).toBe("Hide keywords");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    toggle.click();

    await vi.waitFor(() => expect(keywordValues()).toEqual(["••••••", "••••••"]));
    expect(toggle.textContent).toBe("Show keywords");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("hides keyword management controls until keywords are revealed", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    const firstRow = document.querySelector<HTMLLIElement>("#kwList li")!;
    expect(firstRow.querySelector("input[type='checkbox']")).toBeNull();
    expect(firstRow.querySelector("button.danger")).toBeNull();

    expect(saveSettings).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.click();

    await vi.waitFor(() =>
      expect(document.querySelector("#kwList li input[type='checkbox']")).not.toBeNull(),
    );
    const revealedRow = document.querySelector<HTMLLIElement>("#kwList li")!;
    expect(revealedRow.querySelector<HTMLInputElement>("input[type='checkbox']")!.disabled).toBe(
      false,
    );
    expect(revealedRow.querySelector<HTMLButtonElement>("button.danger")!.disabled).toBe(false);
  });

  it("shows management controls for the hidden keyword being edited", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();

    const rows = document.querySelectorAll<HTMLLIElement>("#kwList li");
    const firstRow = rows[0]!;
    const secondRow = rows[1]!;
    expect(firstRow.querySelector<HTMLInputElement>("input[name='keyword-value']")!.value).toBe(
      "youtube.com",
    );
    expect(firstRow.querySelector<HTMLInputElement>("input[type='checkbox']")!.ariaLabel).toBe(
      "Enable keyword: youtube.com",
    );
    expect(firstRow.querySelector<HTMLButtonElement>("button.danger")!.ariaLabel).toBe(
      "Delete keyword: youtube.com",
    );
    expect(secondRow.querySelector("input[type='checkbox']")).toBeNull();
    expect(secondRow.querySelector("button.danger")).toBeNull();
  });

  it("toggles the hidden keyword being edited", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    const checkbox = document.querySelector<HTMLInputElement>("#kwList li input[type='checkbox']")!;

    clickAfterPotentialInputBlur(checkbox, input);

    await vi.waitFor(() =>
      expect(saveSettings.mock.calls.at(-1)![0].keywords[0].enabled).toBe(false),
    );
  });

  it("keeps the edit input active when toggling the hidden keyword being edited", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    input.value = "draft.example";
    const checkbox = document.querySelector<HTMLInputElement>("#kwList li input[type='checkbox']")!;

    clickAfterPotentialInputBlur(checkbox, input);

    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("draft.example");
  });

  it("deletes the hidden keyword being edited", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    const deleteButton = document.querySelector<HTMLButtonElement>("#kwList li button.danger")!;

    clickAfterPotentialInputBlur(deleteButton, input);

    await vi.waitFor(() => expect(document.querySelectorAll("#kwList li")).toHaveLength(1));
    expect(
      saveSettings.mock.calls.at(-1)![0].keywords.map((k: { value: string }) => k.value),
    ).toEqual(["github.com"]);
  });

  it("edits the real keyword value while keywords are hidden", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    expect(input.value).toBe("youtube.com");

    input.value = "yt.example";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(saveSettings.mock.calls.at(-1)![0].keywords[0].value).toBe("yt.example"),
    );
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.textContent,
      ).toBe("••••••"),
    );
  });

  it("keeps revealed keywords visible while the page remains active", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());
    vi.useFakeTimers();

    const toggle = document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!;
    const keywordValues = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("#kwList li .keyword-value")).map(
        (button) => button.textContent,
      );

    toggle.click();
    expect(keywordValues()).toEqual(["youtube.com", "github.com"]);

    vi.advanceTimersByTime(60_000);

    expect(keywordValues()).toEqual(["youtube.com", "github.com"]);
    expect(toggle.textContent).toBe("Hide keywords");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not hide revealed keywords while a keyword edit is active", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());
    vi.useFakeTimers();

    document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.click();
    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    input.value = "unfinished.example";
    expect(input.isConnected).toBe(true);

    vi.advanceTimersByTime(60_000);

    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("unfinished.example");
    expect(document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.textContent).toBe(
      "Hide keywords",
    );
  });

  it("hides revealed keywords after an edit completes when hiding was requested", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.click();
    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    input.value = "yt.example";

    window.dispatchEvent(new Event("blur"));
    expect(input.isConnected).toBe(true);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(saveSettings.mock.calls.at(-1)![0].keywords[0].value).toBe("yt.example"),
    );
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLButtonElement>("#kwPrivacyToggle")!.textContent).toBe(
        "Show keywords",
      ),
    );
    expect(
      document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.textContent,
    ).toBe("••••••");
  });

  it("hides a single disclosed edit row after blur-requested editing completes", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    input.value = "yt.example";

    window.dispatchEvent(new Event("blur"));
    expect(input.isConnected).toBe(true);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(saveSettings.mock.calls.at(-1)![0].keywords[0].value).toBe("yt.example"),
    );
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.textContent,
      ).toBe("••••••"),
    );
    expect(document.querySelector("#kwList li input[type='checkbox']")).toBeNull();
    expect(document.querySelector("#kwList li button.danger")).toBeNull();
  });

  it("edits a keyword through a keyboard-reachable button", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    input.value = "gitlab.com";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(saveSettings.mock.calls.at(-1)![0].keywords[0].value).toBe("gitlab.com"),
    );
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
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-errormessage")).toBe("kwError");
    expect(document.querySelector("#kwError")!.textContent).toBe("Keyword already exists.");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("clears keyword input errors after a valid keyword is added", async () => {
    setupChrome();
    setupDom();
    await loadOptions(baseSettings());
    const input = document.querySelector<HTMLInputElement>("#kwInput")!;
    const form = document.querySelector<HTMLFormElement>("#kwForm")!;

    input.value = "YOUTUBE.com";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(document.querySelector("#kwError")!.textContent).toBe("Keyword already exists."),
    );

    input.value = "twitter.com";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("false"));
    expect(document.querySelector("#kwError")!.textContent).toBe("");
  });

  it("announces invalid keyword edits through the shared keyword error", async () => {
    setupChrome();
    setupDom();
    const { saveSettings } = await loadOptions(baseSettings());

    document.querySelector<HTMLButtonElement>("#kwList li .keyword-value")!.click();
    const input = document.querySelector<HTMLInputElement>(
      "#kwList li input[name='keyword-value']",
    )!;
    input.value = "github.com";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(document.querySelector("#kwError")!.textContent).toBe(
        "Keyword must be 1-200 characters.",
      ),
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-errormessage")).toBe("kwError");
    expect(saveSettings).not.toHaveBeenCalled();
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
