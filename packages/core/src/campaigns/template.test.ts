import { describe, expect, it } from "vitest";
import { previewStep, renderTemplate } from "./template.js";

const ada = {
  email: "ada@harbor-dental.test",
  firstName: "Ada",
  lastName: "Lovelace",
  company: "Harbor Dental",
  title: "Owner",
  customFields: { city: "Lisbon" },
  unsubscribeLink: "https://example.test/u/preview",
};

describe("renderTemplate", () => {
  it("fills known fields and a custom field", () => {
    const rendered = renderTemplate(
      "Hi {{first_name}} at {{company}} in {{city}}",
      ada,
    );
    expect(rendered).toBe("Hi Ada at Harbor Dental in Lisbon");
  });

  it("uses the fallback when the value is missing or blank", () => {
    const rendered = renderTemplate("Hi {{first_name|there}}", {
      firstName: "  ",
    });
    expect(rendered).toBe("Hi there");
  });

  it("keeps an explicit empty fallback", () => {
    expect(renderTemplate("Hi {{first_name|}}", {})).toBe("Hi ");
  });

  it("renders an empty string when a value and a fallback are both missing", () => {
    expect(renderTemplate("Hi {{first_name}}", {})).toBe("Hi ");
  });

  it("treats fallback text as literal and stops at the first closing brace", () => {
    expect(renderTemplate("X{{first_name|see {{company}}}}Y", {})).toBe("Xsee {{company}}Y");
  });

  it("matches field names without caring about case or spacing", () => {
    expect(renderTemplate("{{ First_Name | there }}", ada)).toBe("Ada");
  });

  it("escapes contact values in HTML mode and leaves the author fallback as written", () => {
    const rendered = renderTemplate("<b>{{company|A & B}}</b>", { company: "A & B <script>" }, {
      escapeValues: true,
    });
    expect(rendered).toBe("<b>A &amp; B &lt;script&gt;</b>");
    expect(renderTemplate("{{company|A & B}}", {}, { escapeValues: true })).toBe("A & B");
  });
});

describe("previewStep", () => {
  it("previews a real contact and warns when the unsubscribe token was removed", () => {
    const preview = previewStep(
      {
        subject: "Hello {{first_name}}",
        body: "We help {{company}}.",
        contentType: "text",
      },
      ada,
    );
    expect(preview.subject).toBe("Hello Ada");
    expect(preview.body).toBe("We help Harbor Dental.");
    expect(preview.warnings.map((warning) => warning)).toContain(
      "This step does not include {{unsubscribe_link}}, so the email will not show an unsubscribe line.",
    );
  });

  it("renders HTML, strips a script, and keeps the unsubscribe token", () => {
    const preview = previewStep(
      {
        subject: "Hello\n{{first_name}}",
        body: `<p>Hi {{first_name}}</p><script>alert(1)</script><a href="{{unsubscribe_link}}">Unsubscribe</a>`,
        contentType: "html",
      },
      { ...ada, firstName: "A <b>" },
    );
    expect(preview.subject).toBe("Hello A <b>");
    expect(preview.body).toBe(
      '<p>Hi A &lt;b&gt;</p><a href="https://example.test/u/preview">Unsubscribe</a>',
    );
    expect(preview.warnings).toEqual([]);
  });
});
