import { describe, expect, it, vi } from "vitest";
import { handleRuntimeMessage } from "@/background/messages";

describe("handleRuntimeMessage", () => {
  it("ignores unrelated messages", () => {
    const sendResponse = vi.fn();
    const handled = handleRuntimeMessage(
      { type: "other.message" },
      { executeCleanup: vi.fn(async () => ({ cleanedAt: null, deletedByKeyword: 0 })) },
      sendResponse,
    );

    expect(handled).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it("responds with cleanup result for cleanNow", async () => {
    const sendResponse = vi.fn();
    const handled = handleRuntimeMessage(
      { type: "histsieve.cleanNow" },
      { executeCleanup: vi.fn(async () => ({ cleanedAt: 123, deletedByKeyword: 2 })) },
      sendResponse,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        cleanedAt: 123,
        deletedByKeyword: 2,
      }),
    );
  });

  it("responds with ok=false when cleanup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sendResponse = vi.fn();

    const handled = handleRuntimeMessage(
      { type: "histsieve.cleanNow" },
      {
        executeCleanup: vi.fn(async () => {
          throw new Error("boom");
        }),
      },
      sendResponse,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: "cleanup_failed",
      }),
    );
    warn.mockRestore();
  });
});
