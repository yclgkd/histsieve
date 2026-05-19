import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, setCleanupConfig } from "@/core/settings";
import { attachCleanButton, getCleanButtonText } from "@/ui/shared/clean-button";

const installChrome = (messages: Record<string, string>) => {
  const getMessage = vi.fn((key: string, subs?: string | string[]) => {
    const tpl = messages[key];
    if (tpl === undefined) return "";
    const arr = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
    return tpl.replace(/\$(\d+)\$|\$(\w+)\$/g, (_, idx) => arr[Number(idx ?? 1) - 1] ?? "");
  });
  (globalThis as unknown as { chrome: unknown }).chrome = { i18n: { getMessage } };
};

const baseMessages = {
  btnCleanAll: "Delete all history",
  btnCleanOlder: "Delete entries older than $1$ days",
  btnConfirmAll: "Click again to confirm",
  popupCleaning: "Cleaning…",
  popupCleanedOk: "Done.",
  popupCleanedFail: "Cleanup failed.",
};

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  vi.useRealTimers();
});

describe("getCleanButtonText", () => {
  beforeEach(() => installChrome(baseMessages));

  it("returns 'all history' text when scope=all", () => {
    const s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" });
    expect(getCleanButtonText(s)).toBe("Delete all history");
  });

  it("returns templated 'older than N days' text when scope=olderThan", () => {
    const s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 });
    expect(getCleanButtonText(s)).toBe("Delete entries older than 7 days");
  });
});

describe("attachCleanButton", () => {
  const setupDom = () => {
    document.body.innerHTML = `<button id="btn"></button><div id="result"></div>`;
    return {
      button: document.querySelector<HTMLButtonElement>("#btn")!,
      result: document.querySelector<HTMLDivElement>("#result")!,
    };
  };

  beforeEach(() => installChrome(baseMessages));

  it("renders the scope text on attach (olderThan)", () => {
    const { button, result } = setupDom();
    attachCleanButton({
      button,
      result,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 14 }),
      runCleanup: async () => ({ ok: true }),
    });
    expect(button.textContent).toBe("Delete entries older than 14 days");
    expect(button.classList.contains("danger")).toBe(false);
  });

  it("renders the danger style when scope=all", () => {
    const { button, result } = setupDom();
    attachCleanButton({
      button,
      result,
      getSettings: () => setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }),
      runCleanup: async () => ({ ok: true }),
    });
    expect(button.textContent).toBe("Delete all history");
    expect(button.classList.contains("danger")).toBe(true);
  });

  it("scope=olderThan: single click runs cleanup directly (no confirm)", async () => {
    const { button, result } = setupDom();
    const runCleanup = vi.fn(async () => ({ ok: true }));
    attachCleanButton({
      button,
      result,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup,
    });
    button.click();
    await vi.waitFor(() => expect(result.textContent).toBe("Done."));
    expect(runCleanup).toHaveBeenCalled();
  });

  it("scope=all: first click enters confirm state, does NOT run cleanup", () => {
    const { button, result } = setupDom();
    const runCleanup = vi.fn(async () => ({ ok: true }));
    attachCleanButton({
      button,
      result,
      getSettings: () => setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }),
      runCleanup,
    });
    button.click();
    expect(runCleanup).not.toHaveBeenCalled();
    expect(button.textContent).toBe("Click again to confirm");
    expect(button.classList.contains("confirming")).toBe(true);
  });

  it("scope=all: second click within timeout runs cleanup", async () => {
    const { button, result } = setupDom();
    const runCleanup = vi.fn(async () => ({ ok: true }));
    attachCleanButton({
      button,
      result,
      getSettings: () => setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }),
      runCleanup,
    });
    button.click();
    button.click();
    await vi.waitFor(() => expect(result.textContent).toBe("Done."));
    expect(runCleanup).toHaveBeenCalledOnce();
    expect(button.classList.contains("confirming")).toBe(false);
  });

  it("scope=all: confirm state reverts after timeout", async () => {
    vi.useFakeTimers();
    const { button, result } = setupDom();
    attachCleanButton({
      button,
      result,
      getSettings: () => setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }),
      runCleanup: async () => ({ ok: true }),
      confirmTimeoutMs: 100,
    });
    button.click();
    expect(button.classList.contains("confirming")).toBe(true);
    vi.advanceTimersByTime(150);
    expect(button.classList.contains("confirming")).toBe(false);
    expect(button.textContent).toBe("Delete all history");
  });

  it("shows fail message when runCleanup throws", async () => {
    const { button, result } = setupDom();
    attachCleanButton({
      button,
      result,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup: async () => {
        throw new Error("boom");
      },
    });
    button.click();
    await vi.waitFor(() => expect(result.textContent).toBe("Cleanup failed."));
  });

  it("shows fail message when runCleanup returns ok=false", async () => {
    const { button, result } = setupDom();
    attachCleanButton({
      button,
      result,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup: async () => ({ ok: false }),
    });
    button.click();
    await vi.waitFor(() => expect(result.textContent).toBe("Cleanup failed."));
  });

  it("refresh() updates text after settings change", () => {
    const { button, result } = setupDom();
    let s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 });
    const handle = attachCleanButton({
      button,
      result,
      getSettings: () => s,
      runCleanup: async () => ({ ok: true }),
    });
    expect(button.textContent).toBe("Delete entries older than 7 days");
    s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" });
    handle.refresh();
    expect(button.textContent).toBe("Delete all history");
    expect(button.classList.contains("danger")).toBe(true);
  });
});
