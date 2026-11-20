import { addCalendarDays } from "./time.js";
import type { FollowingStep } from "./types.js";

export type AdvancedEnrollment =
  | { status: "completed" }
  | { status: "active"; stepNumber: number; nextSendAt: Date }
  | { status: "stopped"; reason: "invalid_step_delay" };

/**
 * After a successful send, schedule the next step or complete the enrollment.
 * Delay is a number of calendar days in the mailbox timezone at the same local
 * time. Delay 0 is due immediately; the gap and one-at-a-time rules still apply.
 */
export function advanceEnrollment(input: {
  sentAt: Date;
  timeZone: string;
  nextStep: FollowingStep | null;
}): AdvancedEnrollment {
  if (!input.nextStep) return { status: "completed" };
  const days = input.nextStep.delayDays;
  if (!Number.isInteger(days) || days < 0) {
    return { status: "stopped", reason: "invalid_step_delay" };
  }
  if (days === 0) {
    return {
      status: "active",
      stepNumber: input.nextStep.stepNumber,
      nextSendAt: input.sentAt,
    };
  }
  const nextSendAt = addCalendarDays(input.sentAt, days, input.timeZone);
  if (!nextSendAt) return { status: "stopped", reason: "invalid_step_delay" };
  return {
    status: "active",
    stepNumber: input.nextStep.stepNumber,
    nextSendAt,
  };
}
