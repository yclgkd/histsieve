export function t(key: string, substitutions?: string | string[]): string {
  if (typeof chrome === "undefined" || !chrome.i18n) return key;
  return chrome.i18n.getMessage(key, substitutions) || key;
}

export function applyI18n(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>("[data-i18n]");
  for (const node of nodes) {
    const key = node.dataset.i18n;
    if (!key) continue;
    node.textContent = t(key);
  }
  const titleNodes = root.querySelectorAll<HTMLElement>("[data-i18n-title]");
  for (const node of titleNodes) {
    const key = node.dataset.i18nTitle;
    if (!key) continue;
    node.title = t(key);
  }
  const phNodes = root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]");
  for (const node of phNodes) {
    const key = node.dataset.i18nPlaceholder;
    if (!key) continue;
    node.placeholder = t(key);
  }
}
