import nodemailer from "nodemailer"
import { ImapFlow } from "imapflow"
import type { ProbeInput } from "./types.js"

const TIMEOUT_MS = 15_000

export async function probeSmtp(input: ProbeInput): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure: input.security === "ssl",
    requireTLS: input.security === "starttls",
    ignoreTLS: input.security === "none",
    auth:
      input.auth === "xoauth2"
        ? { type: "OAuth2", user: input.username, accessToken: input.password }
        : { user: input.username, pass: input.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  })
  try {
    await transporter.verify()
  } finally {
    transporter.close()
  }
}

export async function probeImap(input: ProbeInput): Promise<void> {
  const client = new ImapFlow({
    host: input.host,
    port: input.port,
    secure: input.security === "ssl",
    doSTARTTLS: input.security === "starttls",
    auth:
      input.auth === "xoauth2"
        ? { user: input.username, accessToken: input.password }
        : { user: input.username, pass: input.password },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
  })
  try {
    await client.connect()
  } finally {
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }
}
