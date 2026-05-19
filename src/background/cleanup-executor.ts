import { withLastCleanAt } from "@/core/settings";
import type { Settings } from "@/core/types";
import { type CleanerDeps, type CleanupResult, runCleanup } from "./cleaner";

export type CleanupExecutorDeps = CleanerDeps & {
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  setCachedSettings?: (settings: Settings) => void;
};

export function createCleanupExecutor(deps: CleanupExecutorDeps): () => Promise<CleanupResult> {
  let pending: Promise<CleanupResult> | null = null;

  const executeOnce = async (): Promise<CleanupResult> => {
    const settings = await deps.getSettings();
    const result = await runCleanup(settings, deps);
    if (result.cleanedAt !== null) {
      const latestSettings = await deps.getSettings();
      const updated = withLastCleanAt(latestSettings, result.cleanedAt);
      await deps.saveSettings(updated);
      deps.setCachedSettings?.(updated);
    }
    return result;
  };

  return () => {
    if (pending) return pending;
    pending = executeOnce().finally(() => {
      pending = null;
    });
    return pending;
  };
}
