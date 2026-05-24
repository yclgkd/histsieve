import {
  addKeyword,
  exportKeywords,
  isValidKeywordValue,
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
  kwInput: HTMLInputElement;
  kwError: HTMLElement;
  kwPrivacyToggle: HTMLButtonElement;
  kwList: HTMLUListElement;
  kwEmpty: HTMLParagraphElement;
  activeKwCount: HTMLElement;
};

let settings: Settings;
let cleanBtn: CleanButtonHandle | null = null;
let els: Els;
let lastWrittenJson: string | null = null;
let keywordsVisible = false;
// Per-row temporary disclosure: at most one row is revealed at a time.
let disclosedKeywordId: string | null = null;
// Edit mode: a subset of disclosure. Only set when the user clicks the value
// text of an already-disclosed row.
let editingKeywordId: string | null = null;

let savedHideTimer: number | null = null;
const HIDDEN_KEYWORD_TEXT = "••••••";
const SVG_NS = "http://www.w3.org/2000/svg";
type PendingEditOptions = {
  reportInvalid?: boolean;
};

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

function clearKeywordError(): void {
  els.kwError.textContent = "";
  els.kwInput.setAttribute("aria-invalid", "false");
}

function showKeywordError(message: string, input?: HTMLInputElement): void {
  els.kwError.textContent = message;
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-errormessage", "kwError");
  }
  showToast(message, "error");
}

function renderAll(): void {
  renderCleanup();
  renderKeywords();
  cleanBtn?.refresh();
}

async function hideKeywords(options: { force?: boolean } = {}): Promise<void> {
  const changed = keywordsVisible || disclosedKeywordId !== null || editingKeywordId !== null;
  if (!changed) return;

  if (editingKeywordId !== null) {
    const ok = await commitPendingEdit({ reportInvalid: !options.force });
    if (!ok && !options.force) return;
  }

  keywordsVisible = false;
  disclosedKeywordId = null;
  editingKeywordId = null;
  renderKeywords();
}

async function commit(next: Settings, render = true): Promise<boolean> {
  const previous = settings;
  const nextJson = JSON.stringify(next);
  settings = next;
  try {
    lastWrittenJson = nextJson;
    await saveSettings(next);
    if (render) renderAll();
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
  renderKeywordPrivacyToggle();

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

function isKeywordDisclosed(kw: Keyword): boolean {
  return keywordsVisible || disclosedKeywordId === kw.id;
}

function findRowLi(id: string): HTMLLIElement | null {
  for (const li of els.kwList.querySelectorAll<HTMLLIElement>("li")) {
    if (li.dataset.keywordId === id) return li;
  }
  return null;
}

function makeValueButton(kw: Keyword): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "keyword-value";
  btn.dataset.keywordId = kw.id;
  btn.textContent = kw.value;
  btn.title = t("hintClickToEdit");
  btn.setAttribute("aria-label", t("keywordEditLabel", [kw.value]));
  btn.addEventListener("click", () => startEdit(kw.id));
  return btn;
}

function makeMaskedButton(kw: Keyword): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "keyword-value";
  btn.dataset.keywordId = kw.id;
  btn.textContent = HIDDEN_KEYWORD_TEXT;
  btn.title = t("hintClickToReveal");
  btn.setAttribute("aria-label", t("keywordHiddenRevealLabel"));
  btn.addEventListener("click", () => {
    void discloseRow(kw.id);
  });
  return btn;
}

function makeEditInput(kw: Keyword): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.name = "keyword-value";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 200;
  input.className = "keyword-edit";
  input.value = kw.value;
  input.setAttribute("aria-label", t("keywordEditInputLabel"));
  input.setAttribute("aria-describedby", "kwError");
  input.addEventListener("blur", () => {
    void finishEdit(true);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void finishEdit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      void finishEdit(false);
    }
  });
  return input;
}

function makeTrashIcon(): SVGSVGElement {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.classList.add("trash-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  for (const d of ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    icon.appendChild(path);
  }
  return icon;
}

function renderKeywordRow(kw: Keyword): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.keywordId = kw.id;
  if (!kw.enabled) li.classList.add("disabled");
  const disclosed = isKeywordDisclosed(kw);

  if (!disclosed) {
    li.classList.add("masked");
    li.appendChild(makeMaskedButton(kw));
    return li;
  }

  const toggle = document.createElement("label");
  toggle.className = "switch";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = kw.enabled;
  checkbox.setAttribute("aria-label", t("keywordToggleLabel", [kw.value]));
  const slider = document.createElement("span");
  slider.className = "slider";
  toggle.append(checkbox, slider);
  checkbox.addEventListener("change", async () => {
    await commit(setKeywordEnabled(settings, kw.id, checkbox.checked));
  });
  li.appendChild(toggle);

  if (editingKeywordId === kw.id) {
    li.appendChild(makeEditInput(kw));
  } else {
    li.appendChild(makeValueButton(kw));
  }

  const del = document.createElement("button");
  del.className = "icon-btn danger";
  del.type = "button";
  const deleteLabel = t("keywordDeleteLabel", [kw.value]);
  del.title = deleteLabel;
  del.setAttribute("aria-label", deleteLabel);
  del.appendChild(makeTrashIcon());
  del.addEventListener("click", async () => {
    if (disclosedKeywordId === kw.id) {
      disclosedKeywordId = null;
      editingKeywordId = null;
    }
    await commit(removeKeyword(settings, kw.id));
  });
  li.appendChild(del);

  return li;
}

function renderKeywordPrivacyToggle(): void {
  if (settings.keywords.length === 0) {
    keywordsVisible = false;
    disclosedKeywordId = null;
    editingKeywordId = null;
  } else if (
    disclosedKeywordId !== null &&
    !settings.keywords.some((kw) => kw.id === disclosedKeywordId)
  ) {
    disclosedKeywordId = null;
    editingKeywordId = null;
  }
  els.kwPrivacyToggle.textContent = t(keywordsVisible ? "btnHideKeywords" : "btnShowKeywords");
  els.kwPrivacyToggle.setAttribute("aria-pressed", String(keywordsVisible));
  els.kwPrivacyToggle.disabled = settings.keywords.length === 0;
}

async function discloseRow(id: string): Promise<void> {
  clearKeywordError();
  if (disclosedKeywordId === id && editingKeywordId === null) return;
  if (editingKeywordId !== null && editingKeywordId !== id) {
    const ok = await commitPendingEdit();
    if (!ok) return;
  }
  disclosedKeywordId = id;
  editingKeywordId = null;
  renderKeywords();
}

function startEdit(id: string): void {
  clearKeywordError();
  if (editingKeywordId === id) return;
  if (disclosedKeywordId !== id && !keywordsVisible) {
    // Reveal first; recursion-free: render then promote to edit.
    disclosedKeywordId = id;
  }
  editingKeywordId = id;
  renderKeywords();
  const li = findRowLi(id);
  const input = li?.querySelector<HTMLInputElement>('input[name="keyword-value"]');
  if (input) {
    input.focus();
    input.select();
  }
}

// Commit the in-progress edit before the row is hidden or replaced. Returns
// false when validation should keep the current edit UI active.
async function commitPendingEdit(options: PendingEditOptions = {}): Promise<boolean> {
  const reportInvalid = options.reportInvalid ?? true;
  const id = editingKeywordId;
  if (id === null) return true;
  const li = findRowLi(id);
  const input = li?.querySelector<HTMLInputElement>('input[name="keyword-value"]');
  const kw = settings.keywords.find((k) => k.id === id);
  if (!input || !kw) {
    editingKeywordId = null;
    return true;
  }
  const value = input.value.trim();
  if (value.length === 0 || value === kw.value) {
    editingKeywordId = null;
    return true;
  }
  const next = updateKeywordValue(settings, id, value);
  if (next === settings) {
    if (reportInvalid) {
      showKeywordError(t("keywordInvalid"), input);
      input.focus();
      input.select();
      return false;
    }
    editingKeywordId = null;
    return true;
  }
  editingKeywordId = null;
  const ok = await commit(next, false);
  if (ok) clearKeywordError();
  return ok;
}

// Exit edit mode while staying disclosed. Swaps the input for a value button
// in place — no full re-render — so a sibling click that triggered the blur
// (switch / delete) can complete naturally without losing its target DOM.
async function finishEdit(save: boolean): Promise<void> {
  const id = editingKeywordId;
  if (id === null) return;
  const li = findRowLi(id);
  const input = li?.querySelector<HTMLInputElement>('input[name="keyword-value"]');
  const kw = settings.keywords.find((k) => k.id === id);
  if (!input || !kw) {
    editingKeywordId = null;
    return;
  }

  const value = input.value.trim();
  let resolvedKw = kw;
  let valueAccepted = true;

  if (save && value.length > 0 && value !== kw.value) {
    const next = updateKeywordValue(settings, id, value);
    if (next === settings) {
      showKeywordError(t("keywordInvalid"), input);
      valueAccepted = false;
    } else {
      editingKeywordId = null;
      const ok = await commit(next, false);
      if (ok) {
        clearKeywordError();
        resolvedKw = next.keywords.find((k) => k.id === id) ?? kw;
      } else {
        editingKeywordId = id;
        valueAccepted = false;
      }
    }
  } else {
    editingKeywordId = null;
  }

  if (!valueAccepted) {
    // Stay in edit mode so the user can fix the value.
    input.focus();
    input.select();
    return;
  }

  if (input.isConnected) {
    input.replaceWith(makeValueButton(resolvedKw));
  }
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
  els.kwPrivacyToggle.addEventListener("click", async () => {
    const nextVisible = !keywordsVisible;
    if (!nextVisible) {
      const ok = await commitPendingEdit();
      if (!ok) return;
      disclosedKeywordId = null;
      editingKeywordId = null;
    }
    keywordsVisible = nextVisible;
    renderKeywords();
  });

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
  const input = els.kwInput;
  input.addEventListener("input", clearKeywordError);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value.length === 0) return;
    if (!isValidKeywordValue(value)) {
      showKeywordError(t("keywordInvalid"), input);
      return;
    }
    const next = addKeyword(settings, value);
    if (next === settings) {
      showKeywordError(t("keywordDuplicate"), input);
      return;
    }
    if (await commit(next)) {
      input.value = "";
      clearKeywordError();
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
    kwInput: $<HTMLInputElement>("#kwInput"),
    kwError: $<HTMLElement>("#kwError"),
    kwPrivacyToggle: $<HTMLButtonElement>("#kwPrivacyToggle"),
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
  window.addEventListener("blur", () => {
    void hideKeywords({ force: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void hideKeywords({ force: true });
  });
  // Click outside the disclosed row → hide it. Use `click` (not mousedown) so
  // the row's own click handlers run first: clicking another row's masked
  // button hides A and reveals B in a single click, because B's handler calls
  // discloseRow(B) before this listener sees the event. (mousedown would
  // re-render between mousedown and click, leaving B's button detached and
  // its click handler effectively unreachable.)
  document.addEventListener("click", async (e) => {
    if (disclosedKeywordId === null) return;
    if (!(e.target instanceof Element)) return;
    const row = e.target.closest<HTMLLIElement>("li");
    if (row?.dataset.keywordId === disclosedKeywordId) return;
    const ok = await commitPendingEdit();
    if (!ok) return;
    disclosedKeywordId = null;
    editingKeywordId = null;
    renderKeywords();
  });

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
