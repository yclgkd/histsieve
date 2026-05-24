// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginKeywordEdit } from "@/ui/options/editable-keyword";

function setupButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "old";
  document.body.appendChild(button);
  return button;
}

function currentInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("input")!;
}

const editOptions = { inputLabel: "Edit keyword value", errorId: "kwError" };

describe("beginKeywordEdit", () => {
  beforeEach(() => {
    document.body.innerHTML = `<p id="kwError"></p>`;
  });

  it("keeps Enter handling active after ordinary typing keys", async () => {
    const button = setupButton();
    const commit = vi.fn(async () => true);

    beginKeywordEdit(button, commit, editOptions);
    currentInput().value = "old-a";
    currentInput().dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    currentInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith("old-a"));
    expect(document.querySelector("button")!.textContent).toBe("old-a");
  });

  it("keeps Escape handling active after ordinary typing keys", () => {
    const button = setupButton();
    const commit = vi.fn(async () => true);

    beginKeywordEdit(button, commit, editOptions);
    currentInput().value = "changed";
    currentInput().dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    currentInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.querySelector("button")!.textContent).toBe("old");
    expect(commit).not.toHaveBeenCalled();
  });

  it("creates a named text input while editing", () => {
    beginKeywordEdit(
      setupButton(),
      vi.fn(async () => true),
      editOptions,
    );

    expect(currentInput().type).toBe("text");
    expect(currentInput().name).toBe("keyword-value");
    expect(currentInput().autocomplete).toBe("off");
    expect(currentInput().spellcheck).toBe(false);
    expect(currentInput().ariaLabel).toBe("Edit keyword value");
    expect(currentInput().getAttribute("aria-describedby")).toBe("kwError");
  });

  it("allows a second blur commit after the first blur commit fails", async () => {
    const button = setupButton();
    const commit = vi
      .fn<Parameters<typeof beginKeywordEdit>[1]>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    beginKeywordEdit(button, commit, editOptions);
    currentInput().value = "duplicate";
    currentInput().dispatchEvent(new FocusEvent("blur"));

    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith("duplicate"));
    currentInput().value = "unique";
    currentInput().dispatchEvent(new FocusEvent("blur"));

    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith("unique"));
    expect(document.querySelector("button")!.textContent).toBe("unique");
  });
});
