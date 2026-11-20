import { DKIM_SELECTORS, dkimHost } from "./selectors.js"
import type { DeliverabilityCheck, DeliverabilityReport, DkimSelectorHit } from "./types.js"

export function joinTxt(chunks: readonly string[]): string {
  return chunks.join("")
}

export function evaluateSpf(txtRecords: readonly string[], domain: string, spfExample: string | null): DeliverabilityCheck {
  const records = txtRecords.map((record) => record.trim()).filter((record) => /^v=spf1(\s|$)/i.test(record))
  if (records.length === 0) {
    const example = spfExample ?? "v=spf1 include:YOUR-EMAIL-HOST ~all"
    return {
      id: "spf",
      status: "fail",
      code: "missing",
      summary: `${domain} has no SPF record.`,
      fix: `Add one TXT record on ${domain} that starts with v=spf1 and lists every service that sends as you. Example: ${example}. Keep it to a single TXT record.`,
    }
  }
  if (records.length > 1) {
    return {
      id: "spf",
      status: "fail",
      code: "multiple",
      summary: `${domain} has ${records.length} SPF records.`,
      fix: "Delete the extra SPF TXT records and keep one. Combine every sender into that single record. More than one SPF record makes the check fail.",
    }
  }
  const tokens = records[0].split(/\s+/)
  const all = tokens.find((token) => /^(?:\+|-|~|\?)?all$/i.test(token))
  const redirect = tokens.some((token) => /^redirect=/i.test(token))
  if (all && /^\+?all$/i.test(all)) {
    return {
      id: "spf",
      status: "fail",
      code: "plus_all",
      summary: "The SPF record uses +all, so any server may send as this domain.",
      fix: "Change +all to ~all or -all after every real sender is listed in the same record.",
    }
  }
  if (!all && !redirect) {
    return {
      id: "spf",
      status: "warn",
      code: "weak",
      summary: "The SPF record has no all or redirect mechanism.",
      fix: "Add ~all or -all at the end once every real sender is included.",
    }
  }
  if (all && /^\?all$/i.test(all)) {
    return {
      id: "spf",
      status: "warn",
      code: "weak",
      summary: "The SPF record ends with ?all, which does not tell receivers to reject unlisted servers.",
      fix: "When you are sure the record lists every sender, change ?all to ~all or -all.",
    }
  }
  return {
    id: "spf",
    status: "pass",
    code: "ok",
    summary: "SPF is published.",
    fix: null,
  }
}

export function evaluateDmarc(txtRecords: readonly string[], domain: string): DeliverabilityCheck {
  const host = `_dmarc.${domain}`
  const records = txtRecords.map((record) => record.trim()).filter((record) => /^v=DMARC1(\s|;|$)/i.test(record))
  if (records.length === 0) {
    return {
      id: "dmarc",
      status: "fail",
      code: "missing",
      summary: `${domain} has no DMARC record.`,
      fix: `Add a TXT record at ${host} with: v=DMARC1; p=none; rua=mailto:dmarc@${domain}. Start with p=none, then move to p=quarantine or p=reject.`,
    }
  }
  if (records.length > 1) {
    return {
      id: "dmarc",
      status: "fail",
      code: "multiple",
      summary: `${host} has more than one DMARC record.`,
      fix: "Keep a single TXT record on _dmarc. Delete the others.",
    }
  }
  const policy = readTag(records[0], "p")
  if (!policy) {
    return {
      id: "dmarc",
      status: "fail",
      code: "invalid",
      summary: "The DMARC record has no p= policy.",
      fix: "Add p=none, p=quarantine, or p=reject to the DMARC TXT record.",
    }
  }
  if (policy.toLowerCase() === "none") {
    return {
      id: "dmarc",
      status: "warn",
      code: "monitoring",
      summary: "DMARC is in monitoring mode (p=none).",
      fix: "Leave p=none until real mail passes, then change it to p=quarantine or p=reject.",
    }
  }
  if (policy.toLowerCase() === "quarantine" || policy.toLowerCase() === "reject") {
    return {
      id: "dmarc",
      status: "pass",
      code: "ok",
      summary: `DMARC policy is p=${policy.toLowerCase()}.`,
      fix: null,
    }
  }
  return {
    id: "dmarc",
    status: "fail",
    code: "invalid",
    summary: `DMARC policy p=${policy} is not none, quarantine, or reject.`,
    fix: "Set p= to none, quarantine, or reject.",
  }
}

export function evaluateMx(
  records: readonly { exchange: string; priority: number }[],
  domain: string,
): DeliverabilityCheck {
  if (records.length === 0) {
    return {
      id: "mx",
      status: "fail",
      code: "missing",
      summary: `${domain} has no MX records.`,
      fix: "Add the MX records from your email host so other servers know where this domain receives mail.",
    }
  }
  const exchanges = records
    .map((record) => ({ ...record, exchange: record.exchange.replace(/\.$/, "").toLowerCase() }))
    .sort((a, b) => a.priority - b.priority)
  if (exchanges.length === 1 && (exchanges[0].exchange === "." || exchanges[0].exchange === "")) {
    return {
      id: "mx",
      status: "fail",
      code: "null_mx",
      summary: `${domain} publishes a null MX and does not accept mail.`,
      fix: "Replace the null MX with the MX records from your email host if this domain should receive replies.",
    }
  }
  const names = exchanges.map((record) => record.exchange).join(", ")
  return {
    id: "mx",
    status: "pass",
    code: "ok",
    summary: `MX records: ${names}.`,
    fix: null,
  }
}

export function evaluateDkimSelector(selector: string, domain: string, txtRecords: readonly string[], cnames: readonly string[]): DkimSelectorHit {
  const host = dkimHost(selector, domain)
  for (const record of txtRecords) {
    const key = dkimKey(record)
    if (key === "ok") return { selector, host, found: true, via: "txt", revoked: false }
    if (key === "revoked") return { selector, host, found: false, via: "txt", revoked: true }
  }
  const cname = cnames.map((value) => value.replace(/\.$/, "")).find((value) => value.length > 0)
  if (cname) return { selector, host, found: true, via: "cname", revoked: false }
  return { selector, host, found: false, via: null, revoked: false }
}

export function summarizeDkim(domain: string, hits: readonly DkimSelectorHit[]): DeliverabilityCheck {
  const found = hits.filter((hit) => hit.found)
  if (found.length > 0) {
    const listed = found.map((hit) => `${hit.selector} (${hit.via})`).join(", ")
    return {
      id: "dkim",
      status: "pass",
      code: "ok",
      summary: `DKIM is published for ${listed}.`,
      fix: null,
    }
  }
  if (hits.some((hit) => hit.revoked)) {
    return {
      id: "dkim",
      status: "fail",
      code: "revoked",
      summary: "A common DKIM selector is published with an empty key (revoked).",
      fix: "Publish the current DKIM key from your email host. An empty p= value means the key was revoked.",
    }
  }
  return {
    id: "dkim",
    status: "warn",
    code: "none_found",
    summary: `No DKIM key found for the common selectors on ${domain}.`,
    fix: `We checked ${DKIM_SELECTORS.join(", ")}. If your host uses another selector, publish the TXT or CNAME they give you at <selector>._domainkey.${domain}.`,
  }
}

export function buildDeliverabilityReport(domain: string, checks: DeliverabilityCheck[]): DeliverabilityReport {
  return {
    domain,
    checks,
    launchWarning: launchWarningFor(domain, checks),
  }
}

export function launchWarningFor(domain: string, checks: readonly DeliverabilityCheck[]): string | null {
  const missing = checks.filter((check) => (check.id === "spf" || check.id === "dmarc") && check.code === "missing")
  if (missing.length === 0) return null
  const names = missing.map((check) => check.id.toUpperCase()).join(" and ")
  return `${domain} is missing ${names}. You can still launch, but mail is more likely to be rejected or filed as spam. Add the record, then recheck this mailbox.`
}

function readTag(record: string, name: string): string | null {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;\\s]+)`, "i").exec(record)
  return match ? match[1] : null
}

function dkimKey(record: string): "ok" | "revoked" | "no" {
  const compact = record.replace(/\s+/g, "")
  const match = /(?:^|;)p=([^;]*)/i.exec(compact)
  if (!match) return "no"
  return match[1].length > 0 ? "ok" : "revoked"
}
