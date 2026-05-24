import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readGenerator(): string {
  return readFileSync(join(process.cwd(), "scripts/generate-store-assets.mjs"), "utf8");
}

describe("store asset generator", () => {
  it("keeps the options screenshot mock aligned with keyword privacy UI", () => {
    const source = readGenerator();
    const versionTemplate = ["HistSieve v", "$", "{pkg.version}"].join("");

    expect(source).toContain("package.json");
    expect(source).toContain('id="kwPrivacyToggle"');
    expect(source).toContain("Show keywords");
    expect(source).toContain('class="masked"');
    expect(source).toContain('class="keyword-value"');
    expect(source).toContain("••••••");
    expect(source).toContain("View on GitHub");
    expect(source).toContain(versionTemplate);
    expect(source).not.toContain(">youtube.com</span>");
  });
});
