import { describe, expect, it } from "vitest";
import { detectAutoReply } from "./auto-reply.js";
import type { InboundMail } from "./types.js";

function mail(subject: string, headers: Record<string, string> = {}): Pick<InboundMail, "subject" | "headers"> {
  return { subject, headers };
}

describe("detectAutoReply", () => {
  it("ignores Auto-Submitted: no", () => {
    expect(detectAutoReply(mail("Re: Intro", { "auto-submitted": "no" })).isAutoReply).toBe(false);
  });

  it("flags Auto-Submitted other than no", () => {
    const detected = detectAutoReply(mail("Re: Intro", { "auto-submitted": "auto-replied" }));
    expect(detected.isAutoReply).toBe(true);
    expect(detected.signals).toContain("auto-submitted:auto-replied");
  });

  it("flags X-Autoreply and X-Autorespond when they are affirmative", () => {
    expect(detectAutoReply(mail("Re: Intro", { "x-autoreply": "yes" })).signals).toContain("x-autoreply");
    expect(detectAutoReply(mail("Re: Intro", { "x-autorespond": "true" })).signals).toContain("x-autorespond");
    expect(detectAutoReply(mail("Re: Intro", { "x-autoreply": "" })).signals).toContain("x-autoreply");
  });

  it("ignores X-Autoreply: no", () => {
    expect(detectAutoReply(mail("Re: Intro", { "x-autoreply": "no" })).isAutoReply).toBe(false);
  });

  it("flags out-of-office subjects after stripping Re:", () => {
    expect(detectAutoReply(mail("Out of Office Re: Intro")).signals).toContain("subject:out-of-office");
    expect(detectAutoReply(mail("Automatic reply: Intro")).signals).toContain("subject:automatic-reply");
    expect(detectAutoReply(mail("Re: Out of office hours")).signals).toContain("subject:out-of-office");
  });

  it("does not flag an ordinary reply subject", () => {
    expect(detectAutoReply(mail("Re: Quarterly plan")).isAutoReply).toBe(false);
    expect(detectAutoReply(mail("Re: Intro")).isAutoReply).toBe(false);
  });
});
