import { createNodeDnsResolver, checkDeliverability } from "../packages/core/src/dns/index.js"
import { spfExampleForPreset } from "../packages/core/src/mail/index.js"
import { runDoctor, type DoctorDeps } from "./doctor.js"

export async function doctorMain(env: Record<string, string | undefined> = process.env): Promise<number> {
  const report = await runDoctor(await createDoctorDeps(env))
  process.stdout.write(`${report.text}\n`)
  return report.ok ? 0 : 1
}

export async function createDoctorDeps(env: Record<string, string | undefined>): Promise<DoctorDeps> {
  return {
    env,
    now: new Date(),
    database: () => checkDatabase(),
    workerHeartbeatAt: () => readWorkerHeartbeat(),
    fetchPublicUrl: fetchPublic,
    mailboxes: () => loadMailboxes(),
  }
}

async function checkDatabase(): Promise<{ ok: boolean; detail: string }> {
  const mod = await importOptional("../packages/core/src/db/doctor-db.ts")
  const ping = mod?.pingDatabase
  if (typeof ping !== "function") {
    return { ok: false, detail: "The database check is not wired yet." }
  }
  const result: unknown = await ping()
  if (result && typeof result === "object" && "ok" in result && "detail" in result) {
    return result as { ok: boolean; detail: string }
  }
  return { ok: false, detail: "The database check returned an unexpected result." }
}

async function readWorkerHeartbeat(): Promise<Date | null> {
  const mod = await importOptional("../packages/core/src/db/doctor-db.ts")
  const read = mod?.workerHeartbeatAt
  if (typeof read !== "function") return null
  const result: unknown = await read()
  return result instanceof Date ? result : null
}

async function loadMailboxes(): Promise<Awaited<ReturnType<DoctorDeps["mailboxes"]>>> {
  const mod = await importOptional("../apps/server/src/mailboxes/doctor-mailboxes.ts")
  const load = mod?.loadDoctorMailboxes
  if (typeof load !== "function") return []
  const result: unknown = await load()
  return Array.isArray(result) ? (result as Awaited<ReturnType<DoctorDeps["mailboxes"]>>) : []
}

async function importOptional(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    const imported: unknown = await import(specifier)
    if (!imported || typeof imported !== "object") return null
    return imported as Record<string, unknown>
  } catch {
    return null
  }
}

async function fetchPublic(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8_000) })
    return { ok: true, detail: `${url} responded with HTTP ${response.status}.` }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "The request failed." }
  }
}

export async function checkMailboxDns(email: string, presetId: string) {
  return checkDeliverability(email, createNodeDnsResolver(), spfExampleForPreset(presetId))
}

const entry = process.argv[1] ?? ""
if (entry.endsWith("doctor-cli.ts") || entry.endsWith("doctor-cli.js")) {
  doctorMain().then((code) => {
    process.exitCode = code
  })
}
