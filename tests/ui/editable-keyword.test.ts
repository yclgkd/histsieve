// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { beginKeywordEdit } from "@/ui/options/editable-keyword";

function setupSpan(): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = "old";
  document.body.appendChild(span);
  return span;
}

function mockBlur(span: HTMLSpanElement) {
  return vi.spyOn(span, "blur").mockImplementation(() => {
    span.dispatchEvent(new FocusEvent("blur"));
  });
}

describe("beginKeywordEdit", () => {
  it("keeps Enter handling active after ordinary typing keys", async () => {
    const span = setupSpan();
    const blur = mockBlur(span);
    const commit = vi.fn(async () => true);

    beginKeywordEdit(span, commit);
    span.textContent = "old-a";
    span.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    span.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith("old-a"));
    expect(blur).toHaveBeenCalledOnce();
  });

  it("keeps Escape handling active after ordinary typing keys", () => {
    const span = setupSpan();
    const blur = mockBlur(span);
    const commit = vi.fn(async () => true);

    beginKeywordEdit(span, commit);
    span.textContent = "changed";
    span.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    span.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(span.textContent).toBe("old");
    expect(commit).not.toHaveBeenCalled();
    expect(blur).toHaveBeenCalledOnce();
  });
});
