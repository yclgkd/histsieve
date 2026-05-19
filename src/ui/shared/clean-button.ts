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
  getSettings: () => Settings;
  runCleanup: () => Promise<{ ok: boolean }>;
  confirmTimeoutMs?: number;
  successRevertMs?: number;
  failureRevertMs?: number;
};

const DEFAULT_CONFIRM_TIMEOUT_MS = 4000;
const DEFAULT_SUCCESS_REVERT_MS = 1200;
const DEFAULT_FAILURE_REVERT_MS = 2000;

const STATE_CLASSES = ["confirming", "busy", "success", "error"];

export function attachCleanButton(opts: CleanButtonOptions): CleanButtonHandle {
  const { button, getSettings, runCleanup } = opts;
  const confirmTimeoutMs = opts.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS;
  const successRevertMs = opts.successRevertMs ?? DEFAULT_SUCCESS_REVERT_MS;
  const failureRevertMs = opts.failureRevertMs ?? DEFAULT_FAILURE_REVERT_MS;

  let confirming = false;
  let confirmTimer: number | null = null;
  let revertTimer: number | null = null;
  let inFlight = false;

  const clearStateClasses = (): void => {
    for (const cls of STATE_CLASSES) button.classList.remove(cls);
  };

  const cancelConfirm = (): void => {
    confirming = false;
    if (confirmTimer !== null) {
      window.clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  };

  const cancelRevert = (): void => {
    if (revertTimer !== null) {
      window.clearTimeout(revertTimer);
      revertTimer = null;
    }
  };

  const refresh = (): void => {
    if (confirming || inFlight || revertTimer !== null) return;
    const s = getSettings();
    clearStateClasses();
    button.textContent = getCleanButtonText(s);
    button.classList.toggle("danger", s.cleanup.scope === "all");
  };

  const enterConfirmState = (): void => {
    confirming = true;
    clearStateClasses();
    button.classList.add("confirming", "danger");
    button.textContent = t("btnConfirmAll");
    confirmTimer = window.setTimeout(() => {
      cancelConfirm();
      refresh();
    }, confirmTimeoutMs);
  };

  const showOutcome = (className: "success" | "error", text: string, revertMs: number): void => {
    clearStateClasses();
    button.classList.add(className);
    button.textContent = text;
    revertTimer = window.setTimeout(() => {
      revertTimer = null;
      refresh();
    }, revertMs);
  };

  const runAndReport = async (): Promise<void> => {
    cancelConfirm();
    cancelRevert();
    inFlight = true;
    button.disabled = true;
    clearStateClasses();
    button.classList.add("busy");
    button.textContent = t("popupCleaning");
    try {
      const response = await runCleanup();
      inFlight = false;
      button.disabled = false;
      if (response.ok) {
        showOutcome("success", t("popupCleanedOk"), successRevertMs);
      } else {
        showOutcome("error", t("popupCleanedFail"), failureRevertMs);
      }
    } catch {
      inFlight = false;
      button.disabled = false;
      showOutcome("error", t("popupCleanedFail"), failureRevertMs);
    }
  };

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    if (inFlight) return;
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
