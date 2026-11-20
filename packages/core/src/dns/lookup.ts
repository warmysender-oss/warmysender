import { Resolver } from "node:dns/promises"
import { domainToASCII } from "node:url"
import { DKIM_SELECTORS } from "./selectors.js"
import {
  buildDeliverabilityReport,
  evaluateDkimSelector,
  evaluateDmarc,
  evaluateMx,
  evaluateSpf,
  summarizeDkim,
} from "./evaluate.js"
import type { DeliverabilityCheck, DeliverabilityReport, DnsResolver } from "./types.js"

const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

export function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, "")
  const withoutAt = trimmed.includes("@") ? trimmed.slice(trimmed.lastIndexOf("@") + 1) : trimmed
  if (withoutAt.length === 0) return null
  const ascii = domainToASCII(withoutAt)
  if (!ascii || !DOMAIN.test(ascii)) return null
  return ascii
}

export async function checkDeliverability(
  emailOrDomain: string,
  resolver: DnsResolver,
  spfExample: string | null = null,
): Promise<DeliverabilityReport> {
  const domain = normalizeDomain(emailOrDomain)
  if (!domain) {
    const label = emailOrDomain.trim().toLowerCase()
    return buildDeliverabilityReport(label, [
      failed("spf", "Enter the mailbox domain before checking DNS."),
      failed("dkim", "Enter the mailbox domain before checking DNS."),
      failed("dmarc", "Enter the mailbox domain before checking DNS."),
      failed("mx", "Enter the mailbox domain before checking DNS."),
    ])
  }

  const [spfTxt, dmarcTxt, mxRecords] = await Promise.all([
    readRows(() => resolver.resolveTxt(domain)),
    readRows(() => resolver.resolveTxt(`_dmarc.${domain}`)),
    readRows(() => resolver.resolveMx(domain)),
  ])

  const spf = spfTxt.failed
    ? lookupFailed("spf")
    : evaluateSpf(spfTxt.rows.map(joinTxtChunks), domain, spfExample)
  const dmarc = dmarcTxt.failed
    ? lookupFailed("dmarc")
    : evaluateDmarc(dmarcTxt.rows.map(joinTxtChunks), domain)
  const mx = mxRecords.failed ? lookupFailed("mx") : evaluateMx(mxRecords.rows, domain)

  const selectorLookups = await Promise.all(
    DKIM_SELECTORS.map(async (selector) => {
      const host = `${selector}._domainkey.${domain}`
      const [txt, cname] = await Promise.all([
        readRows(() => resolver.resolveTxt(host)),
        readRows(() => resolver.resolveCname(host)),
      ])
      return {
        failed: txt.failed || cname.failed,
        hit: evaluateDkimSelector(selector, domain, txt.rows.map(joinTxtChunks), cname.rows),
      }
    }),
  )
  const hits = selectorLookups.map((item) => item.hit)
  const dkim =
    selectorLookups.some((item) => item.failed) && !hits.some((hit) => hit.found)
      ? lookupFailed("dkim")
      : summarizeDkim(domain, hits)

  return buildDeliverabilityReport(domain, [spf, dkim, dmarc, mx])
}

export function createNodeDnsResolver(): DnsResolver {
  const resolver = new Resolver()
  return {
    resolveTxt: (name) => resolver.resolveTxt(name),
    resolveMx: (name) => resolver.resolveMx(name),
    resolveCname: (name) => resolver.resolveCname(name),
  }
}

function joinTxtChunks(chunks: string[]): string {
  return chunks.join("")
}

async function readRows<T>(run: () => Promise<T[]>): Promise<{ rows: T[]; failed: boolean }> {
  try {
    return { rows: await run(), failed: false }
  } catch (error) {
    if (isNotFound(error)) return { rows: [], failed: false }
    return { rows: [], failed: true }
  }
}

function lookupFailed(id: DeliverabilityCheck["id"]): DeliverabilityCheck {
  return {
    id,
    status: "unknown",
    code: "lookup_failed",
    summary: `The ${id.toUpperCase()} lookup did not finish.`,
    fix: "Try the check again. If it keeps failing, confirm this server can resolve public DNS.",
  }
}

function failed(id: DeliverabilityCheck["id"], summary: string): DeliverabilityCheck {
  return { id, status: "fail", code: "invalid", summary, fix: null }
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false
  const code = String((error as { code: unknown }).code)
  return code === "ENOTFOUND" || code === "ENODATA" || code === "ENODOMAIN"
}
