import type { DeliverabilityReport } from "../../../../../packages/core/src/dns/types.js"
import type { MailPreset } from "../../../../../packages/core/src/mail/types.js"

export type MailboxCard = {
  id: string
  provider: "smtp" | "microsoft"
  presetId: string
  fromName: string
  email: string
  dailyCap: number
  effectiveDailyCap: number
  rampLabel: string | null
  paused: boolean
  pauseReason: string | null
  timeZone: string
  windowStart: string
  windowEnd: string
  sendingDays: string[]
  minGapMinutes: number
  maxGapMinutes: number
  signature: string
}

export type MicrosoftButton = {
  available: boolean
  message: string | null
  startPath: "/api/oauth/microsoft/start"
}

export function capLine(mailbox: Pick<MailboxCard, "rampLabel" | "effectiveDailyCap" | "dailyCap">): string {
  if (mailbox.rampLabel) return mailbox.rampLabel
  return `${mailbox.effectiveDailyCap} a day (cap ${mailbox.dailyCap})`
}

export function microsoftButton(availability: { available: boolean; message?: string }): MicrosoftButton {
  return {
    available: availability.available,
    message: availability.available ? null : (availability.message ?? "Microsoft sign-in is not configured."),
    startPath: "/api/oauth/microsoft/start",
  }
}

export function deliverabilityRows(report: DeliverabilityReport): DeliverabilityReport["checks"] {
  return report.checks
}

export function presetOptions(presets: readonly MailPreset[]): { id: string; label: string }[] {
  return presets.map((preset) => ({ id: preset.id, label: preset.label }))
}
