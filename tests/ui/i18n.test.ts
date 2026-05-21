// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyI18n, getUILocale, t } from "@/ui/shared/i18n";

const installChrome = (messages: Record<string, string>) => {
  const getMessage = vi.fn((key: string) => messages[key] ?? "");
  (globalThis as unknown as { chrome: unknown }).chrome = {
    i18n: { getMessage },
  };
  return getMessage;
};

const installChromeWithLocale = (locale: string) => {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    i18n: { getMessage: vi.fn(() => ""), getUILanguage: vi.fn(() => locale) },
  };
};

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("t", () => {
  it("returns chrome.i18n.getMessage result", () => {
    installChrome({ helloKey: "Hello!" });
    expect(t("helloKey")).toBe("Hello!");
  });

  it("falls back to key when chrome unavailable", () => {
    expect(t("missing")).toBe("missing");
  });

  it("falls back to key when message empty", () => {
    installChrome({});
    expect(t("missing")).toBe("missing");
  });
});

describe("getUILocale", () => {
  it("returns Chrome UI locale when available", () => {
    installChromeWithLocale("zh-CN");
    expect(getUILocale()).toBe("zh-CN");
  });

  it("falls back to en when chrome locale is unavailable", () => {
    expect(getUILocale()).toBe("en");
  });
});

describe("applyI18n", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <h1 data-i18n="title">x</h1>
      <input data-i18n-placeholder="ph" />
      <button data-i18n-title="tip"></button>
      <span data-i18n="">untouched</span>
    `;
  });

  it("sets textContent for data-i18n", () => {
    installChrome({ title: "Welcome" });
    applyI18n();
    expect(document.querySelector("h1")!.textContent).toBe("Welcome");
  });

  it("sets placeholder for data-i18n-placeholder", () => {
    installChrome({ ph: "Type here" });
    applyI18n();
    expect(document.querySelector("input")!.placeholder).toBe("Type here");
  });

  it("sets title for data-i18n-title", () => {
    installChrome({ tip: "Tooltip" });
    applyI18n();
    expect(document.querySelector("button")!.title).toBe("Tooltip");
  });

  it("leaves elements with an empty data-i18n key untouched", () => {
    installChrome({ "": "SHOULD-NOT-APPEAR" });
    applyI18n();
    expect(document.querySelector("span")!.textContent).toBe("untouched");
  });
});
