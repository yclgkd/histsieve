import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleVisit } from "@/background/keyword-watcher";
import { addKeyword, DEFAULT_SETTINGS } from "@/core/settings";
import type { Settings } from "@/core/types";

const settingsWith = (...keywords: string[]): Settings =>
  keywords.reduce((acc, kw) => addKeyword(acc, kw), DEFAULT_SETTINGS);

describe("handleVisit", () => {
  const deleteUrl = vi.fn(async () => {});

  beforeEach(() => {
    deleteUrl.mockClear();
  });

  it("deletes when url matches keyword", async () => {
    await handleVisit(
      { url: "https://youtube.com/watch?v=1", title: "" },
      { getSettings: () => settingsWith("youtube"), deleteUrl },
    );
    expect(deleteUrl).toHaveBeenCalledWith("https://youtube.com/watch?v=1");
  });

  it("deletes when title matches keyword", async () => {
    await handleVisit(
      { url: "https://news.example.com", title: "Funny Cats Compilation" },
      { getSettings: () => settingsWith("cats"), deleteUrl },
    );
    expect(deleteUrl).toHaveBeenCalledOnce();
  });

  it("does nothing when no keyword matches", async () => {
    await handleVisit(
      { url: "https://example.com", title: "Hello" },
      { getSettings: () => settingsWith("youtube"), deleteUrl },
    );
    expect(deleteUrl).not.toHaveBeenCalled();
  });

  it("does nothing when extension disabled", async () => {
    const s = { ...settingsWith("youtube"), enabled: false };
    await handleVisit(
      { url: "https://youtube.com", title: "" },
      { getSettings: () => s, deleteUrl },
    );
    expect(deleteUrl).not.toHaveBeenCalled();
  });

  it("does nothing when no keywords configured", async () => {
    await handleVisit(
      { url: "https://anything.com", title: "Anything" },
      { getSettings: () => DEFAULT_SETTINGS, deleteUrl },
    );
    expect(deleteUrl).not.toHaveBeenCalled();
  });

  it("ignores non-http(s) urls (avoid touching chrome:// or about:)", async () => {
    await handleVisit(
      { url: "chrome://newtab/", title: "youtube" },
      { getSettings: () => settingsWith("youtube"), deleteUrl },
    );
    expect(deleteUrl).not.toHaveBeenCalled();
  });

  it("swallows deletion errors without throwing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(
      handleVisit(
        { url: "https://youtube.com", title: "" },
        { getSettings: () => settingsWith("youtube"), deleteUrl: failing },
      ),
    ).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalled();
  });
});
