// @vitest-environment jsdom

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
    document.body.innerHTML = `<button id="btn"></button>`;
    return document.querySelector<HTMLButtonElement>("#btn")!;
  };

  beforeEach(() => installChrome(baseMessages));

  it("renders the scope text on attach (olderThan)", () => {
    const button = setupDom();
    attachCleanButton({
      button,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 14 }),
      runCleanup: async () => ({ ok: true }),
    });
    expect(button.textContent).toBe("Delete entries older than 14 days");
    expect(button.classList.contains("danger")).toBe(false);
  });

  it("renders the danger style when scope=all", () => {
    const button = setupDom();
    attachCleanButton({
      button,
      getSettings: () => setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }),
      runCleanup: async () => ({ ok: true }),
    });
    expect(button.textContent).toBe("Delete all history");
    expect(button.classList.contains("danger")).toBe(true);
  });

  it("scope=olderThan: single click runs cleanup, shows Done on button then reverts", async () => {
    const button = setupDom();
    const runCleanup = vi.fn(async () => ({ ok: true }));
    attachCleanButton({
      button,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup,
      successRevertMs: 50,
    });
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Done."));
    expect(button.classList.contains("success")).toBe(true);
    expect(runCleanup).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(button.textContent).toBe("Delete entries older than 30 days"));
    expect(button.classList.contains("success")).toBe(false);
  });

  it("transitions through busy state before showing outcome", async () => {
    const button = setupDom();
    let resolveRun: (v: { ok: boolean }) => void = () => {};
    const runCleanup = (): Promise<{ ok: boolean }> =>
      new Promise((resolve) => {
        resolveRun = resolve;
      });
    attachCleanButton({
      button,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup,
    });
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Cleaning…"));
    expect(button.classList.contains("busy")).toBe(true);
    expect(button.disabled).toBe(true);
    resolveRun({ ok: true });
    await vi.waitFor(() => expect(button.classList.contains("success")).toBe(true));
    expect(button.disabled).toBe(false);
  });

  it("ignores clicks while in flight", async () => {
    const button = setupDom();
    let resolveRun: (v: { ok: boolean }) => void = () => {};
    const runCleanup = vi.fn(
      (): Promise<{ ok: boolean }> =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    attachCleanButton({
      button,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup,
    });
    button.click();
    button.click();
    button.click();
    resolveRun({ ok: true });
    await vi.waitFor(() => expect(button.classList.contains("success")).toBe(true));
    expect(runCleanup).toHaveBeenCalledOnce();
  });

  it("scope=all: first click enters confirm state, does NOT run cleanup", () => {
    const button = setupDom();
    const runCleanup = vi.fn(async () => ({ ok: true }));
    attachCleanButton({
      button,
      getSettings: () => setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }),
      runCleanup,
    });
    button.click();
    expect(runCleanup).not.toHaveBeenCalled();
    expect(button.textContent).toBe("Click again to confirm");
    expect(button.classList.contains("confirming")).toBe(true);
  });

  it("scope=all: second click within timeout runs cleanup", async () => {
    const button = setupDom();
    const runCleanup = vi.fn(async () => ({ ok: true }));
    attachCleanButton({
      button,
      getSettings: () => setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" }),
      runCleanup,
      successRevertMs: 50,
    });
    button.click();
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Done."));
    expect(runCleanup).toHaveBeenCalledOnce();
    expect(button.classList.contains("confirming")).toBe(false);
  });

  it("scope=all: confirm state reverts after timeout", async () => {
    vi.useFakeTimers();
    const button = setupDom();
    attachCleanButton({
      button,
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

  it("shows error state when runCleanup throws", async () => {
    const button = setupDom();
    attachCleanButton({
      button,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup: async () => {
        throw new Error("boom");
      },
      failureRevertMs: 50,
    });
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Cleanup failed."));
    expect(button.classList.contains("error")).toBe(true);
    await vi.waitFor(() => expect(button.textContent).toBe("Delete entries older than 30 days"));
  });

  it("shows error state when runCleanup returns ok=false", async () => {
    const button = setupDom();
    attachCleanButton({
      button,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup: async () => ({ ok: false }),
      failureRevertMs: 50,
    });
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Cleanup failed."));
    expect(button.classList.contains("error")).toBe(true);
  });

  it("refresh() updates text after settings change", () => {
    const button = setupDom();
    let s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 7 });
    const handle = attachCleanButton({
      button,
      getSettings: () => s,
      runCleanup: async () => ({ ok: true }),
    });
    expect(button.textContent).toBe("Delete entries older than 7 days");
    s = setCleanupConfig(DEFAULT_SETTINGS, { scope: "all" });
    handle.refresh();
    expect(button.textContent).toBe("Delete all history");
    expect(button.classList.contains("danger")).toBe(true);
  });

  it("refresh() is a no-op while showing success outcome (does not stomp the message)", async () => {
    const button = setupDom();
    const handle = attachCleanButton({
      button,
      getSettings: () =>
        setCleanupConfig(DEFAULT_SETTINGS, { scope: "olderThan", olderThanDays: 30 }),
      runCleanup: async () => ({ ok: true }),
      successRevertMs: 200,
    });
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Done."));
    handle.refresh();
    expect(button.textContent).toBe("Done.");
  });
});
