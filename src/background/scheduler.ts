import type { Settings } from "@/core/types";
import { hoursToMinutes } from "@/core/time";

export const ALARM_NAME = "histsieve-cleanup";

export type SchedulerDeps = {
  createAlarm: (name: string, periodInMinutes: number) => Promise<void>;
  clearAlarm: (name: string) => Promise<void>;
};

export async function syncAlarms(settings: Settings, deps: SchedulerDeps): Promise<void> {
  const shouldRun = settings.enabled && settings.cleanup.intervalEnabled;
  if (!shouldRun) {
    await deps.clearAlarm(ALARM_NAME);
    return;
  }
  await deps.createAlarm(ALARM_NAME, hoursToMinutes(settings.cleanup.intervalHours));
}
