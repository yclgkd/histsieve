import { loadSettings, saveSettings, onSettingsChanged } from "@/platform/chrome";
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
import { applyI18n, t } from "@/ui/shared/i18n";
import { formatTimestamp } from "@/ui/shared/format";
import { attachCleanButton, type CleanButtonHandle } from "@/ui/shared/clean-button";
import pkg from "../../../package.json";

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

let settings: Settings;
let cleanBtn: CleanButtonHandle | null = null;

let savedHideTimer: number | null = null;

function showToast(message: string, variant: "success" | "error" = "success", ms = 1800): void {
  const el = $<HTMLElement>("#saveStatus");
  $<HTMLElement>("#saveStatusText").textContent = message;
  el.classList.remove("error");
  if (variant === "error") el.classList.add("error");
  el.classList.add("visible");
  if (savedHideTimer !== null) window.clearTimeout(savedHideTimer);
  savedHideTimer = window.setTimeout(() => {
    el.classList.remove("visible");
    savedHideTimer = null;
  }, ms);
}

function showSaved(): void {
  showToast(t("statusSaved"), "success", 1200);
}

async function commit(next: Settings): Promise<void> {
  settings = next;
  await saveSettings(next);
  showSaved();
}

function renderKeywords(): void {
  const list = $<HTMLUListElement>("#kwList");
  const empty = $<HTMLParagraphElement>("#kwEmpty");

  $<HTMLElement>("#activeKwCount").textContent = String(
    settings.keywords.filter((k) => k.enabled).length,
  );

  list.innerHTML = "";
  if (settings.keywords.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (const kw of settings.keywords) {
    list.appendChild(renderKeywordRow(kw));
  }
}

function renderKeywordRow(kw: Keyword): HTMLLIElement {
  const li = document.createElement("li");
  if (!kw.enabled) li.classList.add("disabled");

  const toggle = document.createElement("label");
  toggle.className = "switch";
  toggle.innerHTML = `<input type="checkbox" ${kw.enabled ? "checked" : ""} /><span class="slider"></span>`;
  toggle.querySelector("input")!.addEventListener("change", async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await commit(setKeywordEnabled(settings, kw.id, checked));
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
  if (span.isContentEditable) return;
  const original = span.textContent ?? "";
  span.contentEditable = "true";
  span.focus();
  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  const finish = async (): Promise<void> => {
    span.contentEditable = "false";
    const newValue = (span.textContent ?? "").trim();
    if (newValue.length === 0 || newValue === original) {
      span.textContent = original;
      return;
    }
    await commit(updateKeywordValue(settings, id, newValue));
  };

  span.addEventListener("blur", finish, { once: true });
  span.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        span.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        span.textContent = original;
        span.blur();
      }
    },
    { once: true },
  );
}

function renderCleanup(): void {
  $<HTMLInputElement>("#enabled").checked = settings.enabled;
  $<HTMLInputElement>("#intervalEnabled").checked = settings.cleanup.intervalEnabled;
  $<HTMLInputElement>("#intervalHours").value = String(settings.cleanup.intervalHours);
  $<HTMLInputElement>("#onStartup").checked = settings.cleanup.onStartup;
  $<HTMLInputElement>("#olderThanDays").value = String(settings.cleanup.olderThanDays);
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="scope"]')) {
    radio.checked = radio.value === settings.cleanup.scope;
  }

  const locale = chrome.i18n?.getUILanguage?.() ?? "en";
  $<HTMLSpanElement>("#lastClean").textContent = formatTimestamp(
    settings.lastCleanAt,
    locale,
    t("popupNever"),
  );
}

function wireCleanupInputs(): void {
  $<HTMLInputElement>("#enabled").addEventListener("change", async (e) => {
    await commit({ ...settings, enabled: (e.target as HTMLInputElement).checked });
  });

  $<HTMLInputElement>("#intervalEnabled").addEventListener("change", async (e) => {
    await commit(
      setCleanupConfig(settings, { intervalEnabled: (e.target as HTMLInputElement).checked }),
    );
  });

  $<HTMLInputElement>("#intervalHours").addEventListener("change", async (e) => {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    await commit(setCleanupConfig(settings, { intervalHours: v }));
    renderCleanup();
  });

  $<HTMLInputElement>("#onStartup").addEventListener("change", async (e) => {
    await commit(
      setCleanupConfig(settings, { onStartup: (e.target as HTMLInputElement).checked }),
    );
  });

  $<HTMLInputElement>("#olderThanDays").addEventListener("change", async (e) => {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    await commit(setCleanupConfig(settings, { olderThanDays: v }));
    renderCleanup();
    cleanBtn?.refresh();
  });

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="scope"]')) {
    radio.addEventListener("change", async (e) => {
      const value = (e.target as HTMLInputElement).value as CleanupScope;
      await commit(setCleanupConfig(settings, { scope: value }));
      cleanBtn?.refresh();
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

  const merge = window.confirm(t("importPrompt", [String(parsed.length)]));
  if (merge) {
    const result = mergeKeywords(settings, parsed);
    await commit(result.next);
    renderKeywords();
    showToast(t("importDoneMerge", [String(result.added), String(result.skipped)]));
    return;
  }

  const existing = settings.keywords.length;
  if (existing > 0) {
    const ok = window.confirm(
      t("importReplaceConfirm", [String(existing), String(parsed.length)]),
    );
    if (!ok) return;
  }
  await commit(replaceKeywords(settings, parsed));
  renderKeywords();
  showToast(t("importDoneReplace", [String(parsed.length)]));
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
      input.value = "";
      return;
    }
    await commit(next);
    input.value = "";
    renderKeywords();
  });
}

async function init(): Promise<void> {
  applyI18n();
  $<HTMLElement>("#appVersion").textContent = `v${pkg.version}`;
  settings = await loadSettings();
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
      return { ok: Boolean(r?.ok) };
    },
  });

  onSettingsChanged((next) => {
    settings = next;
    renderCleanup();
    renderKeywords();
    cleanBtn?.refresh();
  });
}

void init();
