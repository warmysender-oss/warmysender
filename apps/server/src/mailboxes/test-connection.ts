import type { ProbeInput } from "./types.js"
import { plainConnectionError } from "../../../../packages/core/src/mail/errors.js"

export type ConnectionSide = {
  ok: boolean
  message: string
}

export type ConnectionTestResult = {
  ok: boolean
  smtp: ConnectionSide
  imap: ConnectionSide
}

export type MailboxProbes = {
  smtp: (input: ProbeInput) => Promise<void>
  imap: (input: ProbeInput) => Promise<void>
}

export async function testMailboxConnection(
  input: { smtp: ProbeInput; imap: ProbeInput },
  probes: MailboxProbes,
): Promise<ConnectionTestResult> {
  const [smtp, imap] = await Promise.all([
    runSide("SMTP", input.smtp, probes.smtp),
    runSide("IMAP", input.imap, probes.imap),
  ])
  return { ok: smtp.ok && imap.ok, smtp, imap }
}

async function runSide(
  protocol: "SMTP" | "IMAP",
  input: ProbeInput,
  probe: (input: ProbeInput) => Promise<void>,
): Promise<ConnectionSide> {
  const secrets = [input.password]
  try {
    await probe(input)
  } catch (error) {
    return { ok: false, message: plainConnectionError(error, protocol, secrets) }
  }
  const tlsNote = input.security === "none" ? " The connection did not use TLS." : ""
  return { ok: true, message: `${protocol} login succeeded.${tlsNote}` }
}
