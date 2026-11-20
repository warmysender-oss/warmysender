import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./html.js";

describe("sanitizeHtml", () => {
  it("drops scripts, images, and event handlers", () => {
    const cleaned = sanitizeHtml(
      `<div onclick="alert(1)">Hi</div><script>alert(1)</script><img src="x" onerror="alert(1)"><p>Ok</p>`,
    );
    expect(cleaned).toBe("<div>Hi</div><p>Ok</p>");
  });

  it("keeps a normal link and the unsubscribe token, and drops javascript links", () => {
    const cleaned = sanitizeHtml(
      `<a href="javascript:alert(1)">bad</a><a href="https://example.test">site</a><a href="{{unsubscribe_link}}">Unsubscribe</a>`,
    );
    expect(cleaned).toBe(
      '<a>bad</a><a href="https://example.test">site</a><a href="{{unsubscribe_link}}">Unsubscribe</a>',
    );
  });

  it("leaves template braces in the text alone", () => {
    expect(sanitizeHtml("<p>Hi {{first_name|there}}</p>")).toBe("<p>Hi {{first_name|there}}</p>");
  });
});
