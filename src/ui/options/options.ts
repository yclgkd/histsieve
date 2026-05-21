import {
  addKeyword,
  exportKeywords,
  mergeKeywords,
  parseKeywordsExport,
  removeKeyword,
  replaceKeywords,
  setCleanupConfig,
  setKeywordEnabled,
  updateKeywordValue,
} from "@/core/settings";
import type { CleanupScope, Keyword, Settings } from "@/core/types";
import { loadSettings, onSettingsChanged, saveSettings } from "@/platform/chrome";
import { attachCleanButton, type CleanButtonHandle } from "@/ui/shared/clean-button";
import { formatTimestamp } from "@/ui/shared/format";
import { applyI18n, getUILocale, t } from "@/ui/shared/i18n";
import pkg from "../../../package.json";
import { beginKeywordEdit } from "./editable-keyword";

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

type Els = {
  enabled: HTMLInputElement;
  intervalEnabled: HTMLInputElement;
  intervalHours: HTMLInputElement;
  onStartup: HTMLInputElement;
  olderThanDays: HTMLInputElement;
  lastClean: HTMLSpanElement;
  saveStatus: HTMLElement;
  saveStatusText: HTMLElement;
  kwList: HTMLUListElement;
  kwEmpty: HTMLParagraphElement;
  activeKwCount: HTMLElement;
};

let settings: Settings;
let cleanBtn: CleanButtonHandle | null = null;
let els: Els;
let lastWrittenJson: string | null = null;

let savedHideTimer: number | null = null;

function showToast(message: string, variant: "success" | "error" = "success", ms = 1800): void {
  els.saveStatusText.textContent = message;
  els.saveStatus.classList.toggle("error", variant === "error");
  els.saveStatus.classList.add("visible");
  if (savedHideTimer !== null) window.clearTimeout(savedHideTimer);
  savedHideTimer = window.setTimeout(() => {
    els.saveStatus.classList.remove("visible");
    savedHideTimer = null;
  }, ms);
}

function showSaved(): void {
  showToast(t("statusSaved"), "success", 1200);
}

function renderAll(): void {
  renderCleanup();
  renderKeywords();
  cleanBtn?.refresh();
}

async function commit(next: Settings): Promise<boolean> {
  const previous = settings;
  const nextJson = JSON.stringify(next);
  settings = next;
  try {
    lastWrittenJson = nextJson;
    await saveSettings(next);
    renderAll();
    showSaved();
    return true;
  } catch (err) {
    console.warn("[histsieve] save settings failed", err);
    lastWrittenJson = null;
    settings = previous;
    renderAll();
    showToast(t("statusSaveFailed"), "error", 2400);
    return false;
  }
}

function renderKeywords(): void {
  els.activeKwCount.textContent = String(settings.keywords.filter((k) => k.enabled).length);

  els.kwList.replaceChildren();
  if (settings.keywords.length === 0) {
    els.kwEmpty.classList.remove("hidden");
    return;
  }
  els.kwEmpty.classList.add("hidden");

  for (const kw of settings.keywords) {
    els.kwList.appendChild(renderKeywordRow(kw));
  }
}

function renderKeywordRow(kw: Keyword): HTMLLIElement {
  const li = document.createElement("li");
  if (!kw.enabled) li.classList.add("disabled");

  const toggle = document.createElement("label");
  toggle.className = "switch";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = kw.enabled;
  const slider = document.createElement("span");
  slider.className = "slider";
  toggle.append(checkbox, slider);
  checkbox.addEventListener("change", async () => {
    await commit(setKeywordEnabled(settings, kw.id, checkbox.checked));
  });
  li.appendChild(toggle);

  const value = document.createElement("span");
  value.className = "value";
  value.textContent = kw.value;
  value.title = t("hintClickToEdit");
  value.addEventListener("click", () => beginEdit(value, kw.id));
  li.appendChild(value);

  const del = document.createElement("button");
  del.className = "icon-btn danger";
  del.textContent = t("btnDelete");
  del.addEventListener("click", async () => {
    await commit(removeKeyword(settings, kw.id));
  });
  li.appendChild(del);

  return li;
}

function beginEdit(span: HTMLSpanElement, id: string): void {
  beginKeywordEdit(span, (newValue) => {
    const next = updateKeywordValue(settings, id, newValue);
    if (next === settings) {
      showToast(t("keywordInvalid"), "error");
      return Promise.resolve(false);
    }
    return commit(next);
  });
}

function renderCleanup(): void {
  els.enabled.checked = settings.enabled;
  els.intervalEnabled.checked = settings.cleanup.intervalEnabled;
  els.intervalHours.value = String(settings.cleanup.intervalHours);
  els.onStartup.checked = settings.cleanup.onStartup;
  els.olderThanDays.value = String(settings.cleanup.olderThanDays);
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="scope"]')) {
    radio.checked = radio.value === settings.cleanup.scope;
  }

  els.lastClean.textContent = formatTimestamp(settings.lastCleanAt, getUILocale(), t("popupNever"));
}

function wireCleanupInputs(): void {
  els.enabled.addEventListener("change", async () => {
    await commit({ ...settings, enabled: els.enabled.checked });
  });

  els.intervalEnabled.addEventListener("change", async () => {
    await commit(setCleanupConfig(settings, { intervalEnabled: els.intervalEnabled.checked }));
  });

  els.intervalHours.addEventListener("change", async () => {
    const v = parseInt(els.intervalHours.value, 10);
    await commit(setCleanupConfig(settings, { intervalHours: v }));
  });

  els.onStartup.addEventListener("change", async () => {
    await commit(setCleanupConfig(settings, { onStartup: els.onStartup.checked }));
  });

  els.olderThanDays.addEventListener("change", async () => {
    const v = parseInt(els.olderThanDays.value, 10);
    await commit(setCleanupConfig(settings, { olderThanDays: v }));
  });

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="scope"]')) {
    radio.addEventListener("change", async (e) => {
      const value = (e.target as HTMLInputElement).value as CleanupScope;
      await commit(setCleanupConfig(settings, { scope: value }));
    });
  }
}

function downloadKeywordsExport(): void {
  const payload = exportKeywords(settings);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `histsieve-keywords-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function handleImportFile(file: File): Promise<void> {
  let parsed: Keyword[];
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    parsed = parseKeywordsExport(raw);
  } catch {
    showToast(t("importError"), "error");
    return;
  }

  if (parsed.length === 0) {
    showToast(t("importEmpty"), "error");
    return;
  }

  const mode = await chooseImportMode(parsed.length, settings.keywords.length);
  if (mode === "cancel") return;

  if (mode === "merge") {
    const result = mergeKeywords(settings, parsed);
    if (await commit(result.next)) {
      showToast(t("importDoneMerge", [String(result.added), String(result.skipped)]));
    }
    return;
  }

  if (await commit(replaceKeywords(settings, parsed))) {
    showToast(t("importDoneReplace", [String(parsed.length)]));
  }
}

type ImportMode = "merge" | "replace" | "cancel";

function toImportMode(value: string): ImportMode {
  return value === "merge" || value === "replace" ? value : "cancel";
}

function chooseImportMode(count: number, existing: number): Promise<ImportMode> {
  const dialog = $<HTMLDialogElement>("#importModeDialog");
  const message = $<HTMLParagraphElement>("#importModeMessage");
  message.textContent = t("importModeMessage", [String(count), String(existing)]);

  if (typeof dialog.showModal !== "function") {
    const answer = window.prompt(t("importPromptFallback", [String(count)]), "merge");
    return Promise.resolve(toImportMode(answer?.trim().toLowerCase() ?? "cancel"));
  }

  return new Promise((resolve) => {
    dialog.returnValue = "cancel";
    dialog.addEventListener("close", () => resolve(toImportMode(dialog.returnValue)), {
      once: true,
    });
    dialog.showModal();
  });
}

function wireImportExport(): void {
  $<HTMLButtonElement>("#kwExport").addEventListener("click", () => {
    downloadKeywordsExport();
  });

  const fileInput = $<HTMLInputElement>("#kwImportFile");
  $<HTMLButtonElement>("#kwImport").addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await handleImportFile(file);
  });
}

function wireKeywordForm(): void {
  const form = $<HTMLFormElement>("#kwForm");
  const input = $<HTMLInputElement>("#kwInput");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value.length === 0) return;
    const next = addKeyword(settings, value);
    if (next === settings) {
      showToast(t("keywordDuplicate"), "error");
      input.value = "";
      return;
    }
    if (await commit(next)) {
      input.value = "";
    }
  });
}

function cacheEls(): Els {
  return {
    enabled: $<HTMLInputElement>("#enabled"),
    intervalEnabled: $<HTMLInputElement>("#intervalEnabled"),
    intervalHours: $<HTMLInputElement>("#intervalHours"),
    onStartup: $<HTMLInputElement>("#onStartup"),
    olderThanDays: $<HTMLInputElement>("#olderThanDays"),
    lastClean: $<HTMLSpanElement>("#lastClean"),
    saveStatus: $<HTMLElement>("#saveStatus"),
    saveStatusText: $<HTMLElement>("#saveStatusText"),
    kwList: $<HTMLUListElement>("#kwList"),
    kwEmpty: $<HTMLParagraphElement>("#kwEmpty"),
    activeKwCount: $<HTMLElement>("#activeKwCount"),
  };
}

async function init(): Promise<void> {
  applyI18n();
  els = cacheEls();
  $<HTMLElement>("#appVersion").textContent = `v${pkg.version}`;
  settings = await loadSettings();
  lastWrittenJson = JSON.stringify(settings);
  renderCleanup();
  renderKeywords();
  wireCleanupInputs();
  wireKeywordForm();
  wireImportExport();

  cleanBtn = attachCleanButton({
    button: $<HTMLButtonElement>("#cleanNow"),
    getSettings: () => settings,
    runCleanup: async () => {
      const r = await chrome.runtime.sendMessage({ type: "histsieve.cleanNow" });
      return { ok: Boolean(r?.ok), truncated: Boolean(r?.sweepTruncated) };
    },
  });

  onSettingsChanged((next) => {
    const nextJson = JSON.stringify(next);
    settings = next;
    if (nextJson === lastWrittenJson) return;
    lastWrittenJson = nextJson;
    renderAll();
  });
}

void init();
