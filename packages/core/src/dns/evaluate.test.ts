import { describe, expect, it } from "vitest"
import { evaluateDkimSelector, evaluateDmarc, evaluateMx, evaluateSpf, launchWarningFor, summarizeDkim } from "./evaluate.js"
import { checkDeliverability } from "./lookup.js"
import type { DnsResolver } from "./types.js"

const domain = "harbor-dental.test"

describe("SPF parsing", () => {
  it("passes a single ~all record and joins chunked TXT strings", () => {
    const check = evaluateSpf(["v=spf1 include:_spf.google.com ~all"], domain, null)
    expect(check).toMatchObject({ status: "pass", code: "ok" })
  })

  it("fails when SPF is missing, duplicated, or +all", () => {
    expect(evaluateSpf([], domain, "v=spf1 include:_spf.google.com ~all")).toMatchObject({
      status: "fail",
      code: "missing",
    })
    expect(evaluateSpf(["v=spf1 a ~all", "v=spf1 include:example.com ~all"], domain, null).code).toBe("multiple")
    expect(evaluateSpf(["v=spf1 +all"], domain, null)).toMatchObject({ status: "fail", code: "plus_all" })
  })

  it("warns on ?all", () => {
    expect(evaluateSpf(["v=spf1 include:spf.messagingengine.com ?all"], domain, null).status).toBe("warn")
  })
})

describe("DMARC, DKIM, and MX parsing", () => {
  it("reads DMARC policies", () => {
    expect(evaluateDmarc(["v=DMARC1; p=reject; rua=mailto:dmarc@harbor-dental.test"], domain)).toMatchObject({
      status: "pass",
      code: "ok",
    })
    expect(evaluateDmarc(["v=DMARC1; p=none"], domain)).toMatchObject({ status: "warn", code: "monitoring" })
    expect(evaluateDmarc([], domain).code).toBe("missing")
    expect(evaluateDmarc(["v=DMARC1; rua=mailto:dmarc@harbor-dental.test"], domain).code).toBe("invalid")
  })

  it("accepts a TXT key or a CNAME and ignores an empty p=", () => {
    const txt = evaluateDkimSelector("google", domain, ["v=DKIM1; k=rsa; p=abc123"], [])
    expect(txt).toMatchObject({ found: true, via: "txt" })
    const cname = evaluateDkimSelector("selector1", domain, [], ["selector1-harbor-dental-test._domainkey.example.invalid"])
    expect(cname).toMatchObject({ found: true, via: "cname" })
    const revoked = evaluateDkimSelector("google", domain, ["v=DKIM1; p="], [])
    expect(revoked.revoked).toBe(true)
    expect(summarizeDkim(domain, [txt]).status).toBe("pass")
    expect(summarizeDkim(domain, [revoked]).code).toBe("revoked")
  })

  it("lists MX hosts and flags a null MX", () => {
    expect(evaluateMx([{ exchange: "mx2.harbor-dental.test.", priority: 10 }, { exchange: "mx1.harbor-dental.test.", priority: 5 }], domain).summary)
      .toBe("MX records: mx1.harbor-dental.test, mx2.harbor-dental.test.")
    expect(evaluateMx([], domain).code).toBe("missing")
    expect(evaluateMx([{ exchange: ".", priority: 0 }], domain).code).toBe("null_mx")
  })
})

describe("launch warning", () => {
  it("warns only when SPF or DMARC is missing", () => {
    const missing = [
      evaluateSpf([], domain, null),
      summarizeDkim(domain, []),
      evaluateDmarc(["v=DMARC1; p=reject"], domain),
      evaluateMx([{ exchange: "mx.harbor-dental.test", priority: 10 }], domain),
    ]
    expect(launchWarningFor(domain, missing)).toContain("missing SPF")
    const monitoring = [
      evaluateSpf(["v=spf1 include:_spf.google.com ~all"], domain, null),
      summarizeDkim(domain, []),
      evaluateDmarc(["v=DMARC1; p=none"], domain),
      evaluateMx([{ exchange: "mx.harbor-dental.test", priority: 10 }], domain),
    ]
    expect(launchWarningFor(domain, monitoring)).toBeNull()
  })
})

describe("DNS lookup with a fake resolver", () => {
  it("builds a report from resolver results and ignores chunk boundaries", async () => {
    const resolver: DnsResolver = {
      async resolveTxt(name) {
        if (name === domain) return [["v=spf1 ", "include:_spf.google.com ~all"]]
        if (name === `_dmarc.${domain}`) return [["v=DMARC1; p=quarantine"]]
        if (name === `google._domainkey.${domain}`) return [["v=DKIM1; p=abc"]]
        const error = new Error("not found") as NodeJS.ErrnoException
        error.code = "ENOTFOUND"
        throw error
      },
      async resolveMx() {
        return [{ exchange: "mx.harbor-dental.test", priority: 10 }]
      },
      async resolveCname(name) {
        if (name === `fm1._domainkey.${domain}`) return ["fm1.harbor-dental.test.dkim.fmhosted.com"]
        const error = new Error("not found") as NodeJS.ErrnoException
        error.code = "ENODATA"
        throw error
      },
    }
    const report = await checkDeliverability("Ada@Harbor-Dental.test", resolver, "v=spf1 include:_spf.google.com ~all")
    expect(report.domain).toBe(domain)
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ["spf", "pass"],
      ["dkim", "pass"],
      ["dmarc", "pass"],
      ["mx", "pass"],
    ])
    expect(report.launchWarning).toBeNull()
  })

  it("marks a lookup failure as unknown instead of missing", async () => {
    const resolver: DnsResolver = {
      async resolveTxt() {
        const error = new Error("timeout") as NodeJS.ErrnoException
        error.code = "ETIMEOUT"
        throw error
      },
      async resolveMx() {
        return []
      },
      async resolveCname() {
        return []
      },
    }
    const report = await checkDeliverability(domain, resolver)
    expect(report.checks.find((check) => check.id === "spf")?.code).toBe("lookup_failed")
    expect(report.launchWarning).toBeNull()
  })
})
