// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("static accessibility markup", () => {
  it("labels keyword entry and numeric cleanup inputs", () => {
    document.documentElement.innerHTML = readProjectFile("src/ui/options/index.html");

    expect(document.querySelector("label[for='kwInput']")).not.toBeNull();
    const kwInput = document.querySelector<HTMLInputElement>("#kwInput")!;
    expect(kwInput.name).toBe("keyword");
    expect(kwInput.autocomplete).toBe("off");
    expect(kwInput.getAttribute("spellcheck")).toBe("false");
    expect(kwInput.getAttribute("aria-describedby")).toBe("kwHint kwError");
    expect(kwInput.getAttribute("aria-errormessage")).toBe("kwError");

    expect(document.querySelector("#intervalHours")?.getAttribute("aria-labelledby")).toBe(
      "intervalHoursPrefix intervalHoursSuffix",
    );
    expect(document.querySelector("#olderThanDays")?.getAttribute("aria-labelledby")).toBe(
      "olderThanDaysPrefix olderThanDaysSuffix",
    );
    expect(document.querySelector("#intervalHours")?.hasAttribute("data-i18n-aria-label")).toBe(
      false,
    );
    expect(document.querySelector("#olderThanDays")?.hasAttribute("data-i18n-aria-label")).toBe(
      false,
    );
  });

  it("uses example wording for the keyword placeholder", () => {
    document.documentElement.innerHTML = readProjectFile("src/ui/options/index.html");

    expect(document.querySelector<HTMLInputElement>("#kwInput")!.placeholder).toBe(
      "e.g. youtube.com",
    );
  });

  it("does not add unused form names to popup controls", () => {
    document.documentElement.innerHTML = readProjectFile("src/ui/popup/index.html");

    expect(document.querySelector<HTMLInputElement>(".popup #enabled")!.hasAttribute("name")).toBe(
      false,
    );
  });

  it("does not keep obsolete standalone numeric aria-label messages", () => {
    expect(readProjectFile("public/_locales/en/messages.json")).not.toContain(
      "cfgIntervalHoursLabel",
    );
    expect(readProjectFile("public/_locales/en/messages.json")).not.toContain(
      "cfgOlderThanDaysLabel",
    );
    expect(readProjectFile("src/ui/options/editable-keyword.ts")).not.toContain('"Keyword value"');
  });

  it("connects import dialog title and description", () => {
    document.documentElement.innerHTML = readProjectFile("src/ui/options/index.html");

    const dialog = document.querySelector<HTMLDialogElement>("#importModeDialog")!;
    expect(dialog.getAttribute("aria-labelledby")).toBe("importModeTitle");
    expect(dialog.getAttribute("aria-describedby")).toBe("importModeMessage");
  });

  it("does not put multiple form controls in a single label", () => {
    document.documentElement.innerHTML = readProjectFile("src/ui/options/index.html");
    const labelableSelector = "button,input,meter,output,progress,select,textarea";

    for (const label of document.querySelectorAll("label")) {
      expect(label.querySelectorAll(labelableSelector).length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps switch focus visible and honors reduced motion", () => {
    const popupCss = readProjectFile("src/ui/popup/popup.css");
    const optionsCss = readProjectFile("src/ui/options/options.css");

    for (const css of [popupCss, optionsCss]) {
      expect(css).toContain(".switch input:focus-visible + .slider");
      expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    }
  });

  it("does not style keyword values like links on hover", () => {
    const optionsCss = readProjectFile("src/ui/options/options.css");

    expect(optionsCss).not.toMatch(
      /\.kw-list\s+\.keyword-value:hover\s*\{[^}]*color:\s*var\(--primary\)/,
    );
  });
});
