import { loadSettings, saveSettings, onSettingsChanged } from "@/platform/chrome";
import { applyI18n, t } from "@/ui/shared/i18n";
import { formatTimestamp } from "@/ui/shared/format";
import type { Settings } from "@/core/types";

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

async function render(settings: Settings): Promise<void> {
  const enabledEl = $<HTMLInputElement>("#enabled");
  enabledEl.checked = settings.enabled;

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
  let settings = await loadSettings();
  await render(settings);

  $<HTMLInputElement>("#enabled").addEventListener("change", async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    settings = { ...settings, enabled: checked };
    await saveSettings(settings);
  });

  $<HTMLButtonElement>("#cleanNow").addEventListener("click", async () => {
    const btn = $<HTMLButtonElement>("#cleanNow");
    const result = $<HTMLDivElement>("#cleanResult");
    btn.disabled = true;
    result.textContent = t("popupCleaning");
    try {
      const response = await chrome.runtime.sendMessage({ type: "histsieve.cleanNow" });
      if (response?.ok) {
        result.textContent = t("popupCleanedOk");
      } else {
        result.textContent = t("popupCleanedFail");
      }
    } catch {
      result.textContent = t("popupCleanedFail");
    } finally {
      btn.disabled = false;
    }
  });

  $<HTMLAnchorElement>("#openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  onSettingsChanged((next) => {
    settings = next;
    void render(next);
  });
}

void init();
