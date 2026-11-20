import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyEffectPlan, decideInbound, effectPlan, type InboxSnapshot } from "./decide.js";
import { parseRawEmail } from "./parse-raw.js";
import type { SentMessageRef } from "./types.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function raw(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

const janeStep1: SentMessageRef = {
  messageId: "<campaign-step1@harbor-dental.test>",
  contactId: "contact-jane",
  contactEmail: "jane@river-clinic.test",
  enrollmentId: "enr-jane",
  campaignId: "camp-1",
  stepId: "step-1",
  mailboxId: "mb-1",
  subject: "Intro",
  sentAt: "2026-11-20T11:00:00.000Z",
};

const janeStep2: SentMessageRef = {
  ...janeStep1,
  messageId: "<campaign-step2@harbor-dental.test>",
  stepId: "step-2",
  sentAt: "2026-11-22T11:00:00.000Z",
};

const sam: SentMessageRef = {
  ...janeStep1,
  messageId: "<sam-step@harbor-dental.test>",
  contactId: "contact-sam",
  contactEmail: "sam@northwind.test",
  enrollmentId: "enr-sam",
  campaignId: "camp-2",
  sentAt: "2026-11-21T11:00:00.000Z",
};

const sent = [janeStep1, janeStep2, sam];

const snapshot = (): InboxSnapshot => ({
  contacts: [
    { id: "contact-jane", email: "jane@river-clinic.test", status: "active" },
    { id: "contact-sam", email: "sam@northwind.test", status: "active" },
  ],
  enrollments: [
    { id: "enr-jane", contactId: "contact-jane", campaignId: "camp-1", status: "active", stopReason: null },
    { id: "enr-jane-other", contactId: "contact-jane", campaignId: "camp-9", status: "active", stopReason: null },
    { id: "enr-jane-done", contactId: "contact-jane", campaignId: "camp-done", status: "completed", stopReason: null },
    { id: "enr-sam", contactId: "contact-sam", campaignId: "camp-2", status: "active", stopReason: null },
  ],
  suppressions: [],
});

describe("decideInbound fixtures", () => {
  it("matches a real reply on In-Reply-To and stops every active enrollment", () => {
    const decision = decideInbound(parseRawEmail(raw("reply-in-reply-to.eml")), sent);
    expect(decision.kind).toBe("reply");
    expect(decision.match?.method).toBe("in_reply_to");
    expect(decision.match?.sent.stepId).toBe("step-1");
    const next = applyEffectPlan(snapshot(), decision);
    expect(next.contacts.find((contact) => contact.id === "contact-jane")?.status).toBe("replied");
    expect(next.enrollments.filter((enrollment) => enrollment.contactId === "contact-jane" && enrollment.status === "stopped")).toHaveLength(2);
    expect(next.enrollments.find((enrollment) => enrollment.id === "enr-jane-done")?.status).toBe("completed");
    expect(next.enrollments.find((enrollment) => enrollment.id === "enr-sam")?.status).toBe("active");
    expect(next.suppressions).toEqual([]);
  });

  it("keeps a reply that only mentions out of office in the body", () => {
    const decision = decideInbound(parseRawEmail(raw("reply-in-reply-to.eml")), sent);
    expect(decision.kind).toBe("reply");
    expect(effectPlan(decision).some((effect) => effect.op === "stop_enrollments")).toBe(true);
  });

  it("matches References when In-Reply-To is not ours", () => {
    const decision = decideInbound(parseRawEmail(raw("reply-references-only.eml")), sent);
    expect(decision.kind).toBe("reply");
    expect(decision.match?.method).toBe("references");
    expect(decision.match?.sent.stepId).toBe("step-1");
  });

  it("falls back to sender and subject and picks the latest send", () => {
    const decision = decideInbound(parseRawEmail(raw("reply-sender-subject.eml")), sent);
    expect(decision.kind).toBe("reply");
    expect(decision.match?.method).toBe("sender_subject");
    expect(decision.match?.sent.stepId).toBe("step-2");
  });

  it("labels an out-of-office auto-reply and does not stop the sequence", () => {
    const mail = parseRawEmail(raw("auto-reply-ooo.eml"));
    expect(mail.subject.startsWith("Out of Office")).toBe(true);
    const decision = decideInbound(mail, sent);
    expect(decision.kind).toBe("auto_reply");
    expect(decision.match?.method).toBe("in_reply_to");
    expect(decision.autoReplySignals).toEqual(
      expect.arrayContaining(["auto-submitted:auto-replied", "x-autoreply", "x-autorespond", "subject:out-of-office"]),
    );
    expect(decision.contactEffects).toEqual([]);
    const next = applyEffectPlan(snapshot(), decision);
    expect(next.enrollments.every((enrollment) => enrollment.status === snapshot().enrollments.find((row) => row.id === enrollment.id)?.status)).toBe(true);
    expect(next.contacts.every((contact) => contact.status === "active")).toBe(true);
    expect(effectPlan(decision)).toEqual([{ op: "store_inbound", kind: "auto_reply" }]);
  });

  it("labels a subject-only automatic reply", () => {
    const decision = decideInbound(parseRawEmail(raw("auto-reply-subject-only.eml")), sent);
    expect(decision.kind).toBe("auto_reply");
    expect(decision.match).toBeNull();
    expect(decision.contactEffects).toEqual([]);
  });

  it("treats a multipart DSN as a bounce even when Auto-Submitted is auto-replied", () => {
    const crlf = raw("dsn-failure.eml").replace(/\n/g, "\r\n");
    const decision = decideInbound(parseRawEmail(crlf), sent);
    expect(decision.kind).toBe("bounce");
    expect(decision.autoReplySignals).toEqual([]);
    expect(decision.match?.method).toBe("original_message");
    expect(decision.match?.sent.stepId).toBe("step-1");
    expect(decision.suppressEmails).toEqual(["jane@river-clinic.test"]);
    expect(decision.bounceSignals).toEqual(expect.arrayContaining(["from", "multipart/report", "delivery-status"]));
    const next = applyEffectPlan(snapshot(), decision);
    expect(next.contacts.find((contact) => contact.id === "contact-jane")?.status).toBe("bounced");
    expect(next.suppressions).toEqual(["jane@river-clinic.test"]);
    expect(next.enrollments.filter((enrollment) => enrollment.contactId === "contact-jane" && enrollment.status === "stopped")).toHaveLength(2);
    expect(next.enrollments.find((enrollment) => enrollment.id === "enr-sam")?.status).toBe("active");
  });

  it("does not suppress or stop on a delay notice", () => {
    const decision = decideInbound(parseRawEmail(raw("dsn-delayed.eml")), sent);
    expect(decision.kind).toBe("delivery_delay");
    expect(decision.suppressEmails).toEqual([]);
    expect(decision.contactEffects).toEqual([]);
    const next = applyEffectPlan(snapshot(), decision);
    expect(next.contacts.every((contact) => contact.status === "active")).toBe(true);
    expect(next.suppressions).toEqual([]);
  });

  it("parses a plain-text mailer-daemon bounce", () => {
    const decision = decideInbound(parseRawEmail(raw("dsn-plain.eml")), sent);
    expect(decision.kind).toBe("bounce");
    expect(decision.suppressEmails).toEqual(["jane@river-clinic.test"]);
    expect(decision.contactEffects.map((effect) => effect.contactId)).toEqual(["contact-jane"]);
    expect(decision.unresolvedBounce).toBe(false);
  });

  it("suppresses only the permanently failed recipient", () => {
    const decision = decideInbound(parseRawEmail(raw("dsn-multi.eml")), sent);
    expect(decision.kind).toBe("bounce");
    expect(decision.suppressEmails).toEqual(["jane@river-clinic.test"]);
    expect(decision.contactEffects.map((effect) => effect.contactId)).toEqual(["contact-jane"]);
    const next = applyEffectPlan(snapshot(), decision);
    expect(next.contacts.find((contact) => contact.id === "contact-sam")?.status).toBe("active");
    expect(next.enrollments.find((enrollment) => enrollment.id === "enr-sam")?.status).toBe("active");
  });

  it("keeps a human note from postmaster when it has no DSN structure", () => {
    const decision = decideInbound(parseRawEmail(raw("postmaster-human.eml")), sent);
    expect(decision.kind).toBe("reply");
    expect(decision.match?.method).toBe("in_reply_to");
    expect(decision.suppressEmails).toEqual([]);
  });
});
