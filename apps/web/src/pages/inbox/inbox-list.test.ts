import { describe, expect, it } from "vitest";
import { inboxBadge, interestLabel, threadBadgeLabel } from "./inbox-list.js";

describe("inbox list labels", () => {
  it("labels an auto-reply with the spec string", () => {
    expect(inboxBadge("auto_reply")).toEqual({ label: "auto-reply", tone: "auto_reply" });
  });

  it("labels replies, bounces, delays and unmatched mail", () => {
    expect(inboxBadge("reply").label).toBe("Reply");
    expect(inboxBadge("bounce").label).toBe("Bounce");
    expect(inboxBadge("delivery_delay").label).toBe("Delayed");
    expect(inboxBadge("other").label).toBe("Other");
    expect(inboxBadge("unmatched").label).toBe("Unmatched");
  });

  it("labels interest", () => {
    expect(interestLabel("interested")).toBe("Interested");
    expect(interestLabel("not_interested")).toBe("Not interested");
    expect(interestLabel(null)).toBeNull();
  });
});

describe("sent messages", () => {
  it("labels a sent message Sent, never Unmatched", () => {
    expect(inboxBadge("sent")).toEqual({ label: "Sent", tone: "neutral" });
  });

  it("capitalises thread badges but keeps auto-reply as written", () => {
    expect(threadBadgeLabel("sent")).toBe("Sent");
    expect(threadBadgeLabel("reply")).toBe("Reply");
    expect(threadBadgeLabel("auto-reply")).toBe("auto-reply");
  });
});
