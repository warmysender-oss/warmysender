import { todayInTimeZone } from "@warmysender/core";

/** Calendar date in a mailbox timezone, `YYYY-MM-DD`. Invalid zones throw. */
export function localIsoDate(now: Date, timeZone: string): string {
  try {
    return todayInTimeZone(now, timeZone);
  } catch (error) {
    if (error instanceof RangeError) throw new Error(`Invalid time zone: ${timeZone}`, { cause: error });
    throw error;
  }
}

export type RampPhase = "days_1_7" | "days_8_14" | "graduated";

/** Groups a ramp day for the mailbox card. Cap math lives in `@warmysender/core`. */
export function rampPhase(day: number): RampPhase {
  if (day <= 7) return "days_1_7";
  if (day <= 14) return "days_8_14";
  return "graduated";
}
