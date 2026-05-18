export type Keyword = {
  id: string;
  value: string;
  enabled: boolean;
};

export type CleanupScope = "all" | "olderThan";

export type CleanupConfig = {
  intervalEnabled: boolean;
  intervalHours: number;
  onStartup: boolean;
  scope: CleanupScope;
  olderThanDays: number;
};

export type Settings = {
  enabled: boolean;
  keywords: ReadonlyArray<Keyword>;
  cleanup: CleanupConfig;
  lastCleanAt: number | null;
};
