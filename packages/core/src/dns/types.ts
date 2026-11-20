export type CheckStatus = "pass" | "warn" | "fail" | "unknown"

export type CheckCode =
  | "ok"
  | "missing"
  | "multiple"
  | "plus_all"
  | "weak"
  | "lookup_failed"
  | "none_found"
  | "revoked"
  | "null_mx"
  | "monitoring"
  | "invalid"

export type DeliverabilityCheck = {
  id: "spf" | "dkim" | "dmarc" | "mx"
  status: CheckStatus
  code: CheckCode
  summary: string
  fix: string | null
}

export type DkimSelectorHit = {
  selector: string
  host: string
  found: boolean
  via: "txt" | "cname" | null
  revoked: boolean
}

export type DeliverabilityReport = {
  domain: string
  checks: DeliverabilityCheck[]
  /** Set when SPF or DMARC is missing. A warning, not a hard block. */
  launchWarning: string | null
}

export type DnsResolver = {
  resolveTxt(name: string): Promise<string[][]>
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>
  resolveCname(name: string): Promise<string[]>
}
