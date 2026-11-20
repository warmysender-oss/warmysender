import { describe, expect, it } from "vitest"
import { createSmtpMailbox, recordMailboxAuth } from "./service.js"
import { handleMailHttp, type MailHttpDeps } from "./routes.js"
import type { MailboxRecord, MailboxStore } from "./types.js"
import type { DnsResolver } from "../../../../packages/core/src/dns/types.js"

const codec = {
  encrypt: (plain: string) => `enc:${Buffer.from(plain, "utf8").toString("base64url")}`,
  decrypt: (payload: string) => Buffer.from(payload.slice(4), "base64url").toString("utf8"),
}

describe("mailbox service", () => {
  it("stores passwords only as ciphertext and refuses a cap above 50", async () => {
    const store = memoryStore()
    const now = new Date("2026-01-03T15:00:00.000Z")
    const created = await createSmtpMailbox(draft(), { store, codec, now })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.rampLabel).toBe("Day 1 of ramp: 10 a day")
    expect(JSON.stringify(created.value)).not.toContain("secret-pass")
    const saved = await store.findByEmail("ada@harbor-dental.test")
    expect(saved?.secretsCiphertext.startsWith("enc:")).toBe(true)
    expect(saved?.secretsCiphertext).not.toContain("secret-pass")

    const rejected = await createSmtpMailbox(draft({ dailyCap: 51, email: "bea@harbor-dental.test" }), { store, codec, now })
    expect(rejected.ok).toBe(false)
  })

  it("pauses the mailbox on the third SMTP auth failure and ignores further attempts", async () => {
    const store = memoryStore()
    const now = new Date("2026-01-03T15:00:00.000Z")
    const created = await createSmtpMailbox(draft(), { store, codec, now })
    if (!created.ok) throw new Error("expected mailbox")
    await recordMailboxAuth(created.value.id, "smtp", false, { store, now })
    await recordMailboxAuth(created.value.id, "smtp", false, { store, now })
    const paused = await recordMailboxAuth(created.value.id, "smtp", false, { store, now })
    if (!paused.ok) throw new Error("expected pause")
    expect(paused.value.paused).toBe(true)
    expect(paused.value.pauseReason).toContain("Reconnect")
    const ignored = await recordMailboxAuth(created.value.id, "smtp", false, { store, now })
    if (!ignored.ok) throw new Error("expected unchanged mailbox")
    const row = await store.findById(created.value.id)
    expect(row?.smtpAuthFailureStreak).toBe(3)
  })
})

describe("mailbox HTTP", () => {
  it("requires a signed-in user and completes Microsoft sign-in without putting the secret in the URL", async () => {
    const store = memoryStore()
    const deps = depsFor(store)
    const anonymous = await handleMailHttp({ method: "GET", path: "/api/mailboxes", query: {}, body: null, userId: null }, deps)
    expect(anonymous.status).toBe(401)

    const start = await handleMailHttp({
      method: "GET",
      path: "/api/oauth/microsoft/start",
      query: {},
      body: null,
      userId: "user-1",
    }, deps)
    expect(start.status).toBe(302)
    expect(start.redirect).toContain("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
    expect(start.redirect).toContain("offline_access")
    expect(start.redirect).toContain(encodeURIComponent("https://outlook.office.com/SMTP.Send"))
    expect(start.redirect).not.toContain("client-secret")
    const state = new URL(start.redirect ?? "").searchParams.get("state")
    expect(state).toBeTruthy()

    const callback = await handleMailHttp({
      method: "GET",
      path: "/api/oauth/microsoft/callback",
      query: { code: "auth-code", state: state ?? "" },
      body: null,
      userId: null,
    }, deps)
    expect(callback.status).toBe(302)
    expect(callback.redirect).toContain("microsoft=connected")
    const mailbox = await store.findByEmail("ada@harbor-dental.test")
    expect(mailbox?.provider).toBe("microsoft")
    expect(mailbox?.smtpHost).toBe("smtp.office365.com")
    expect(mailbox?.secretsCiphertext).not.toContain("refresh-token")
  })
})

function depsFor(store: MailboxStore): MailHttpDeps {
  const resolver: DnsResolver = {
    async resolveTxt() {
      return []
    },
    async resolveMx() {
      return []
    },
    async resolveCname() {
      return []
    },
  }
  return {
    store,
    codec,
    probes: {
      async smtp() {
        return undefined
      },
      async imap() {
        return undefined
      },
    },
    resolver,
    now: () => new Date("2026-01-03T15:00:00.000Z"),
    env: () => ({
      clientId: "client-id",
      clientSecret: "client-secret",
      tenant: "common",
      publicUrl: "https://mail.example.com",
      sessionSecret: "session-secret",
    }),
    async fetchToken() {
      return {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        id_token: fakeIdToken({ email: "ada@harbor-dental.test", name: "Ada Harbor" }),
      }
    },
  }
}

function fakeIdToken(payload: Record<string, unknown>): string {
  return `aaa.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`
}

function memoryStore(): MailboxStore {
  const rows = new Map<string, MailboxRecord>()
  return {
    async list() {
      return [...rows.values()]
    },
    async findById(id) {
      return rows.get(id) ?? null
    },
    async findByEmail(email) {
      return [...rows.values()].find((row) => row.email === email) ?? null
    },
    async insert(record) {
      rows.set(record.id, record)
      return record
    },
    async update(id, patch) {
      const current = rows.get(id)
      if (!current) throw new Error("missing mailbox")
      const next = { ...current, ...patch }
      rows.set(id, next)
      return next
    },
  }
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    fromName: "Ada Harbor",
    email: "ada@harbor-dental.test",
    presetId: "custom",
    smtpHost: "smtp.harbor-dental.test",
    smtpPort: 587,
    smtpSecurity: "starttls",
    smtpUsername: "ada@harbor-dental.test",
    imapHost: "imap.harbor-dental.test",
    imapPort: 993,
    imapSecurity: "ssl",
    imapUsername: "ada@harbor-dental.test",
    smtpPassword: "secret-pass",
    imapPassword: "secret-pass",
    dailyCap: 30,
    sendingDays: ["mon", "tue", "wed", "thu", "fri"],
    windowStart: "09:00",
    windowEnd: "17:00",
    timeZone: "UTC",
    minGapMinutes: 4,
    maxGapMinutes: 9,
    signature: "",
    ...overrides,
  }
}
