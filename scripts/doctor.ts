import type { DeliverabilityReport } from "../packages/core/src/dns/index.js"
import type { ConnectionTestResult } from "../apps/server/src/mailboxes/test-connection.js"

export type DoctorCheck = {
  name: string
  status: "ok" | "warn" | "fail"
  detail: string
  fix: string | null
}

export const WORKER_HEARTBEAT_MAX_AGE_MS = 3 * 60 * 1000

export type DoctorDeps = {
  env: Record<string, string | undefined>
  now: Date
  database: () => Promise<{ ok: boolean; detail: string }>
  workerHeartbeatAt: () => Promise<Date | null>
  fetchPublicUrl: (url: string) => Promise<{ ok: boolean; detail: string }>
  mailboxes: () => Promise<
    {
      email: string
      paused: boolean
      pauseReason: string | null
      test: () => Promise<ConnectionTestResult>
      dns: () => Promise<DeliverabilityReport>
    }[]
  >
}

const REQUIRED_ENV: { key: string; fix: string }[] = [
  {
    key: "DATABASE_URL",
    fix: "Set DATABASE_URL to the Postgres connection string. See .env.example.",
  },
  {
    key: "ENCRYPTION_KEY",
    fix: "Set ENCRYPTION_KEY. The app uses it to encrypt mailbox passwords and OAuth refresh tokens.",
  },
  {
    key: "SESSION_SECRET",
    fix: "Set SESSION_SECRET to a long random string. Sessions and Microsoft sign-in state are signed with it.",
  },
  {
    key: "PUBLIC_URL",
    fix: "Set PUBLIC_URL to the public http(s) address of this app, with no trailing path mismatch. Unsubscribe links and the Microsoft redirect URL are built from it.",
  },
]

export async function runDoctor(deps: DoctorDeps): Promise<{ ok: boolean; checks: DoctorCheck[]; text: string }> {
  const checks: DoctorCheck[] = []
  checks.push(...envChecks(deps.env))
  checks.push(await databaseCheck(deps))
  checks.push(await workerCheck(deps))
  checks.push(await publicUrlCheck(deps))
  checks.push(...(await mailboxChecks(deps)))
  const ok = checks.every((check) => check.status !== "fail")
  return { ok, checks, text: formatDoctorReport(checks) }
}

export function formatDoctorReport(checks: readonly DoctorCheck[]): string {
  const lines = ["WarmySender doctor", ""]
  for (const check of checks) {
    lines.push(`[${check.status}] ${check.name}`)
    lines.push(`      ${check.detail}`)
    if (check.fix) lines.push(`      Fix: ${check.fix}`)
  }
  const failed = checks.filter((check) => check.status === "fail").length
  lines.push("")
  lines.push(failed === 0 ? "All checks passed." : `${failed} check${failed === 1 ? "" : "s"} failed.`)
  return lines.join("\n")
}

function envChecks(env: Record<string, string | undefined>): DoctorCheck[] {
  const checks: DoctorCheck[] = REQUIRED_ENV.map((item) => {
    const value = env[item.key]?.trim()
    if (!value) {
      return { name: item.key, status: "fail" as const, detail: `${item.key} is empty.`, fix: item.fix }
    }
    if (item.key === "PUBLIC_URL" && !isHttpUrl(value)) {
      return {
        name: item.key,
        status: "fail" as const,
        detail: "PUBLIC_URL must be an absolute http or https URL.",
        fix: item.fix,
      }
    }
    return { name: item.key, status: "ok" as const, detail: `${item.key} is set.`, fix: null }
  })
  const clientId = env.MS_CLIENT_ID?.trim()
  const clientSecret = env.MS_CLIENT_SECRET?.trim()
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    checks.push({
      name: "Microsoft sign-in",
      status: "fail",
      detail: "Set both MS_CLIENT_ID and MS_CLIENT_SECRET, or leave both empty.",
      fix: "Follow docs/MICROSOFT-APP.md, then set both variables. SMTP mailboxes work without them.",
    })
  } else if (!clientId) {
    checks.push({
      name: "Microsoft sign-in",
      status: "ok",
      detail: "Microsoft sign-in is off. SMTP mailboxes still work.",
      fix: null,
    })
  } else {
    checks.push({
      name: "Microsoft sign-in",
      status: "ok",
      detail: "MS_CLIENT_ID and MS_CLIENT_SECRET are set.",
      fix: null,
    })
  }
  return checks
}

async function databaseCheck(deps: DoctorDeps): Promise<DoctorCheck> {
  try {
    const result = await deps.database()
    return result.ok
      ? { name: "Database", status: "ok", detail: result.detail, fix: null }
      : {
          name: "Database",
          status: "fail",
          detail: result.detail,
          fix: "Check DATABASE_URL and that the Postgres service is running.",
        }
  } catch (error) {
    return {
      name: "Database",
      status: "fail",
      detail: error instanceof Error ? error.message : "Database check threw.",
      fix: "Check DATABASE_URL and that the Postgres service is running.",
    }
  }
}

async function workerCheck(deps: DoctorDeps): Promise<DoctorCheck> {
  const seen = await deps.workerHeartbeatAt()
  if (!seen) {
    return {
      name: "Worker",
      status: "fail",
      detail: "No worker heartbeat was found.",
      fix: "Start the worker service. In Docker that is the worker container. The doctor expects a heartbeat newer than 3 minutes.",
    }
  }
  const age = deps.now.getTime() - seen.getTime()
  if (age > WORKER_HEARTBEAT_MAX_AGE_MS) {
    return {
      name: "Worker",
      status: "fail",
      detail: `The last worker heartbeat is ${Math.round(age / 1000)} seconds old.`,
      fix: "Restart the worker. Sending and inbox polling stop while it is down.",
    }
  }
  return { name: "Worker", status: "ok", detail: "The worker heartbeat is fresh.", fix: null }
}

async function publicUrlCheck(deps: DoctorDeps): Promise<DoctorCheck> {
  const url = deps.env.PUBLIC_URL?.trim()
  if (!url || !isHttpUrl(url)) {
    return {
      name: "PUBLIC_URL reachable",
      status: "fail",
      detail: "PUBLIC_URL is not a usable URL, so it was not requested.",
      fix: "Set PUBLIC_URL to the address browsers use to reach this app.",
    }
  }
  const result = await deps.fetchPublicUrl(url)
  return result.ok
    ? { name: "PUBLIC_URL reachable", status: "ok", detail: result.detail, fix: null }
    : {
        name: "PUBLIC_URL reachable",
        status: "fail",
        detail: result.detail,
        fix: "PUBLIC_URL must respond. Unsubscribe links and the Microsoft redirect URL use it.",
      }
}

async function mailboxChecks(deps: DoctorDeps): Promise<DoctorCheck[]> {
  const mailboxes = await deps.mailboxes()
  if (mailboxes.length === 0) {
    return [{
      name: "Mailboxes",
      status: "ok",
      detail: "No mailboxes are connected yet.",
      fix: null,
    }]
  }
  const checks: DoctorCheck[] = []
  for (const mailbox of mailboxes) {
    if (mailbox.paused) {
      checks.push({
        name: `${mailbox.email} login`,
        status: "fail",
        detail: mailbox.pauseReason ?? "This mailbox is paused.",
        fix: "Reconnect the mailbox. The app will not retry a failing login in a loop.",
      })
    } else {
      const connection = await mailbox.test()
      checks.push({
        name: `${mailbox.email} login`,
        status: connection.ok ? "ok" : "fail",
        detail: `${connection.smtp.message} ${connection.imap.message}`,
        fix: connection.ok ? null : "Open the mailbox and use Test connection. Update the password or sign in with Microsoft again.",
      })
    }
    const report = await mailbox.dns()
    const failed = report.checks.filter((check) => check.status === "fail")
    const warned = report.checks.filter((check) => check.status === "warn")
    if (failed.length > 0) {
      checks.push({
        name: `${mailbox.email} DNS`,
        status: "fail",
        detail: failed.map((check) => check.summary).join(" "),
        fix: failed.map((check) => check.fix).filter(Boolean).join(" "),
      })
    } else if (warned.length > 0) {
      checks.push({
        name: `${mailbox.email} DNS`,
        status: "warn",
        detail: warned.map((check) => check.summary).join(" "),
        fix: warned.map((check) => check.fix).filter(Boolean).join(" "),
      })
    } else {
      checks.push({
        name: `${mailbox.email} DNS`,
        status: "ok",
        detail: "SPF, DKIM, DMARC, and MX look fine.",
        fix: null,
      })
    }
  }
  return checks
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
