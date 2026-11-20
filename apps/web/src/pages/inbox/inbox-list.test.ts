import { describe, expect, it } from "vitest";
import { inboxBadge, interestLabel } from "./inbox-list.js";

describe("inbox list labels", () => {
  it("labels an auto-reply with the spec string", () => {
    expect(inboxBadge("auto_reply")).toEqual({ label: "auto-reply", tone: "auto_reply" });
  });

  it("labels replies, bounces, delays and unmatched mail", () => {
    expect(inboxBadge("reply").label).toBe("Reply");
    expect(inboxBadge("bounce").label).toBe("Bounce");
    expect(inboxBadge("delivery_delay").label).toBe("Delayed");
    expect(inboxBadge("unmatched").label).toBe("Unmatched");
  });

  it("labels interest", () => {
    expect(interestLabel("interested")).toBe("Interested");
    expect(interestLabel("not_interested")).toBe("Not interested");
    expect(interestLabel(null)).toBeNull();
  });
});
