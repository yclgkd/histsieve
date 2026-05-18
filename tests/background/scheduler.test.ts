import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncAlarms, ALARM_NAME } from "@/background/scheduler";
import { DEFAULT_SETTINGS, setCleanupConfig } from "@/core/settings";
import { hoursToMinutes } from "@/core/time";

const make = () => ({
  createAlarm: vi.fn(async (_n: string, _m: number) => {}),
  clearAlarm: vi.fn(async (_n: string) => {}),
});

describe("syncAlarms", () => {
  it("creates alarm when interval enabled and master enabled", async () => {
    const s = setCleanupConfig(DEFAULT_SETTINGS, { intervalEnabled: true, intervalHours: 12 });
    const deps = make();
    await syncAlarms(s, deps);
    expect(deps.createAlarm).toHaveBeenCalledWith(ALARM_NAME, hoursToMinutes(12));
    expect(deps.clearAlarm).not.toHaveBeenCalled();
  });

  it("clears alarm when interval disabled", async () => {
    const s = setCleanupConfig(DEFAULT_SETTINGS, { intervalEnabled: false });
    const deps = make();
    await syncAlarms(s, deps);
    expect(deps.clearAlarm).toHaveBeenCalledWith(ALARM_NAME);
    expect(deps.createAlarm).not.toHaveBeenCalled();
  });

  it("clears alarm when master disabled (even if interval was on)", async () => {
    const s = { ...setCleanupConfig(DEFAULT_SETTINGS, { intervalEnabled: true }), enabled: false };
    const deps = make();
    await syncAlarms(s, deps);
    expect(deps.clearAlarm).toHaveBeenCalledWith(ALARM_NAME);
  });
});
