export type KeywordEditCommit = (value: string) => Promise<boolean>;

export type KeywordEditOptions = {
  inputLabel: string;
  errorId?: string;
  initialValue?: string;
  restoreValue?: string;
  onFinish?: () => void;
};

export function beginKeywordEdit(
  button: HTMLButtonElement,
  commitValue: KeywordEditCommit,
  opts: KeywordEditOptions,
): void {
  const original = opts.initialValue ?? button.textContent ?? "";
  const input = document.createElement("input");
  input.type = "text";
  input.name = "keyword-value";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 200;
  input.className = "keyword-edit";
  input.value = original;
  input.setAttribute("aria-label", opts.inputLabel);
  if (opts.errorId) input.setAttribute("aria-describedby", opts.errorId);

  button.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;

  const restoreButton = (value: string): void => {
    button.textContent = opts.restoreValue ?? value;
    input.removeEventListener("blur", onBlur);
    input.removeEventListener("keydown", onKeydown);
    if (input.isConnected) input.replaceWith(button);
    opts.onFinish?.();
  };

  const finish = async (shouldCommit: boolean): Promise<void> => {
    if (finished) return;
    finished = true;
    input.removeEventListener("keydown", onKeydown);

    const newValue = input.value.trim();
    if (!shouldCommit || newValue.length === 0 || newValue === original) {
      restoreButton(original);
      return;
    }

    const committed = await commitValue(newValue);
    if (!committed) {
      input.setAttribute("aria-invalid", "true");
      if (opts.errorId) input.setAttribute("aria-errormessage", opts.errorId);
      finished = false;
      input.addEventListener("keydown", onKeydown);
      return;
    }

    restoreButton(newValue);
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      void finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      void finish(false);
    }
  };

  const onBlur = (): void => {
    void finish(true);
  };

  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", onKeydown);
}
