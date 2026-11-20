export type Interest = "interested" | "not_interested";

export class InterestNotAllowedError extends Error {
  constructor(readonly kind: string) {
    super(`Interest can be set on a real reply. This message is ${kind}.`);
    this.name = "InterestNotAllowedError";
  }
}

/** Interested / not interested is for a person who replied. Bounces and auto-replies stay unlabelled. */
export function assertCanMarkInterest(kind: string): void {
  if (kind !== "reply") throw new InterestNotAllowedError(kind);
}

export function applyInterest(kind: string, interest: Interest): Interest {
  assertCanMarkInterest(kind);
  return interest;
}
