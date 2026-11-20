/**
 * Integer minutes in [min, max], inclusive.
 * `rng` must return a number in [0, 1). 0 maps to min and values just below 1 map to max.
 */
export function pickGapMinutes(min: number, max: number, rng: () => number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error("gap range must be integers with 1 <= min <= max");
  }
  const roll = rng();
  if (!(roll >= 0 && roll < 1)) {
    throw new Error("rng must return a number in [0, 1)");
  }
  const span = max - min + 1;
  return min + Math.floor(roll * span);
}

export function latestSentAt(sentAtTimes: readonly Date[]): Date | null {
  let latest: Date | null = null;
  for (const sentAt of sentAtTimes) {
    if (!latest || sentAt.getTime() > latest.getTime()) latest = sentAt;
  }
  return latest;
}

/**
 * Minutes that must pass after the latest send.
 * Never shorter than the mailbox minimum. A missing stored gap waits the
 * maximum, which cannot send earlier than a legal random gap.
 * No previous send → 0 (there is no gap yet).
 */
export function enforcedGapMinutes(input: {
  sentAtTimes: readonly Date[];
  minGapMinutes: number;
  maxGapMinutes: number;
  nextGapMinutes: number | null;
}): number {
  if (!latestSentAt(input.sentAtTimes)) return 0;
  if (input.nextGapMinutes === null) return input.maxGapMinutes;
  return Math.max(input.nextGapMinutes, input.minGapMinutes);
}

/** True when `now` is at or after lastSentAt + gapMinutes. */
export function gapElapsed(lastSentAt: Date | null, now: Date, gapMinutes: number): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= gapMinutes * 60_000;
}
