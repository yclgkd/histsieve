export type KeywordEditCommit = (value: string) => Promise<boolean>;

export function beginKeywordEdit(span: HTMLSpanElement, commitValue: KeywordEditCommit): void {
  if (span.contentEditable === "true") return;

  const original = span.textContent ?? "";
  span.contentEditable = "true";
  span.focus();
  selectContents(span);

  let finished = false;

  const finish = async (): Promise<void> => {
    if (finished) return;
    finished = true;
    span.removeEventListener("keydown", onKeydown);
    span.contentEditable = "false";

    const newValue = (span.textContent ?? "").trim();
    if (newValue.length === 0 || newValue === original) {
      span.textContent = original;
      return;
    }

    const committed = await commitValue(newValue);
    if (!committed) span.textContent = original;
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      span.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      span.textContent = original;
      span.blur();
    }
  };

  span.addEventListener("blur", () => void finish(), { once: true });
  span.addEventListener("keydown", onKeydown);
}

function selectContents(span: HTMLSpanElement): void {
  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
