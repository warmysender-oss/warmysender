import { describe, expect, it } from "vitest"
import { plainConnectionError } from "./errors.js"
import { findPreset, listPresets } from "./presets.js"
import { openSecrets, sealSecrets } from "./secrets.js"
import { domainFromEmail, validateMailboxSettings } from "./validate.js"

describe("presets", () => {
  it("includes the documented hosts and ports", () => {
    expect(listPresets().map((preset) => preset.id)).toEqual([
      "gmail",
      "google-workspace",
      "zoho",
      "hostinger",
      "fastmail",
      "custom",
    ])
    expect(findPreset("hostinger")).toMatchObject({
      smtp: { host: "smtp.hostinger.com", port: 465, security: "ssl" },
      imap: { host: "imap.hostinger.com", port: 993, security: "ssl" },
    })
    expect(findPreset("gmail")?.smtp).toEqual({ host: "smtp.gmail.com", port: 587, security: "starttls" })
    expect(findPreset("fastmail")?.imap.host).toBe("imap.fastmail.com")
  })
})

describe("mailbox settings", () => {
  it("accepts a .test mailbox and rejects a cap of 51", () => {
    const ok = validateMailboxSettings(draft())
    expect(ok.ok).toBe(true)
    const high = validateMailboxSettings(draft({ dailyCap: 51 }))
    expect(high.ok).toBe(false)
    if (!high.ok) expect(high.errors.some((error) => error.field === "dailyCap")).toBe(true)
  })

  it("reads the domain from the from-address", () => {
    expect(domainFromEmail("ada@harbor-dental.test")).toBe("harbor-dental.test")
  })
})

describe("connection errors", () => {
  it("turns an auth rejection into plain language and redacts the password", () => {
    const message = plainConnectionError(
      { code: "EAUTH", response: "535 secret-pass rejected" },
      "SMTP",
      ["secret-pass"],
    )
    expect(message).toContain("rejected the username or password")
    expect(message).not.toContain("secret-pass")
    expect(message).not.toContain("535")
  })
})

describe("secrets", () => {
  it("round-trips through the injected cipher and does not store plaintext", () => {
    const codec = {
      encrypt: (plain: string) => `enc:${Buffer.from(plain, "utf8").toString("base64url")}`,
      decrypt: (payload: string) => Buffer.from(payload.slice(4), "base64url").toString("utf8"),
    }
    const sealed = sealSecrets({ kind: "smtp", smtpPassword: "smtp-secret", imapPassword: "imap-secret" }, codec)
    expect(sealed.startsWith("enc:")).toBe(true)
    expect(sealed).not.toContain("smtp-secret")
    expect(openSecrets(sealed, codec)).toEqual({
      kind: "smtp",
      smtpPassword: "smtp-secret",
      imapPassword: "imap-secret",
    })
  })
})

function draft(overrides: Record<string, unknown> = {}) {
  return {
    fromName: "Ada Harbor",
    email: "ada@harbor-dental.test",
    provider: "smtp",
    presetId: "custom",
    smtpHost: "smtp.harbor-dental.test",
    smtpPort: 587,
    smtpSecurity: "starttls",
    smtpUsername: "ada@harbor-dental.test",
    imapHost: "imap.harbor-dental.test",
    imapPort: 993,
    imapSecurity: "ssl",
    imapUsername: "ada@harbor-dental.test",
    dailyCap: 30,
    sendingDays: ["mon", "tue", "wed", "thu", "fri"],
    windowStart: "09:00",
    windowEnd: "17:00",
    timeZone: "UTC",
    minGapMinutes: 4,
    maxGapMinutes: 9,
    signature: "Ada",
    ...overrides,
  }
}
