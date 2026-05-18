const MS_PER_DAY = 86_400_000;

export function daysToMs(days: number): number {
  return days * MS_PER_DAY;
}

export function hoursToMinutes(hours: number): number {
  return hours * 60;
}

export function ageCutoff(now: number, days: number): number {
  return now - daysToMs(days);
}
