import type { Settings } from "@/core/types";
import { t } from "./i18n";

export function getCleanButtonText(settings: Settings): string {
  if (settings.cleanup.scope === "all") {
    return t("btnCleanAll");
  }
  return t("btnCleanOlder", String(settings.cleanup.olderThanDays));
}

export type CleanButtonHandle = {
  refresh: () => void;
};

export type CleanButtonOptions = {
  button: HTMLButtonElement;
  result: HTMLElement;
  getSettings: () => Settings;
  runCleanup: () => Promise<{ ok: boolean }>;
  confirmTimeoutMs?: number;
};

const DEFAULT_CONFIRM_TIMEOUT_MS = 4000;

export function attachCleanButton(opts: CleanButtonOptions): CleanButtonHandle {
  const { button, result, getSettings, runCleanup } = opts;
  const confirmTimeoutMs = opts.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS;

  let confirming = false;
  let confirmTimer: number | null = null;

  const cancelConfirm = (): void => {
    confirming = false;
    button.classList.remove("confirming");
    if (confirmTimer !== null) {
      window.clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  };

  const refresh = (): void => {
    if (confirming) return;
    const s = getSettings();
    button.textContent = getCleanButtonText(s);
    button.classList.toggle("danger", s.cleanup.scope === "all");
  };

  const enterConfirmState = (): void => {
    confirming = true;
    button.classList.add("confirming");
    button.textContent = t("btnConfirmAll");
    confirmTimer = window.setTimeout(() => {
      cancelConfirm();
      refresh();
    }, confirmTimeoutMs);
  };

  const runAndReport = async (): Promise<void> => {
    cancelConfirm();
    button.disabled = true;
    result.textContent = t("popupCleaning");
    try {
      const response = await runCleanup();
      result.textContent = response.ok ? t("popupCleanedOk") : t("popupCleanedFail");
    } catch {
      result.textContent = t("popupCleanedFail");
    } finally {
      button.disabled = false;
      refresh();
    }
  };

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    const s = getSettings();
    if (s.cleanup.scope === "all" && !confirming) {
      enterConfirmState();
      return;
    }
    await runAndReport();
  });

  refresh();
  return { refresh };
}
