import { loadSettings, saveSettings, onSettingsChanged } from "@/platform/chrome";
import { applyI18n, t } from "@/ui/shared/i18n";
import { formatTimestamp } from "@/ui/shared/format";
import { attachCleanButton, type CleanButtonHandle } from "@/ui/shared/clean-button";
import type { Settings } from "@/core/types";

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

let settings: Settings;

function render(): void {
  $<HTMLInputElement>("#enabled").checked = settings.enabled;
  $<HTMLSpanElement>("#kwCount").textContent = String(
    settings.keywords.filter((k) => k.enabled).length,
  );
  const locale = chrome.i18n?.getUILanguage?.() ?? "en";
  $<HTMLSpanElement>("#lastClean").textContent = formatTimestamp(
    settings.lastCleanAt,
    locale,
    t("popupNever"),
  );
}

async function init(): Promise<void> {
  applyI18n();
  settings = await loadSettings();
  render();

  $<HTMLInputElement>("#enabled").addEventListener("change", async (e) => {
    settings = { ...settings, enabled: (e.target as HTMLInputElement).checked };
    await saveSettings(settings);
  });

  const cleanBtn: CleanButtonHandle = attachCleanButton({
    button: $<HTMLButtonElement>("#cleanNow"),
    result: $<HTMLDivElement>("#cleanResult"),
    getSettings: () => settings,
    runCleanup: async () => {
      const response = await chrome.runtime.sendMessage({ type: "histsieve.cleanNow" });
      return { ok: Boolean(response?.ok) };
    },
  });

  $<HTMLButtonElement>("#openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  onSettingsChanged((next) => {
    settings = next;
    render();
    cleanBtn.refresh();
  });
}

void init();
