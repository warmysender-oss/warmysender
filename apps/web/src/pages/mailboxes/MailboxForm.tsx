import { useState } from "react"
import { findPreset, listPresets } from "../../../../../packages/core/src/mail/presets.js"
import {
  DAILY_CAP_DEFAULT,
  DEFAULT_SENDING_DAYS,
  DEFAULT_TIME_ZONE,
  DEFAULT_WINDOW_END,
  DEFAULT_WINDOW_START,
  GAP_DEFAULT_MAX_MINUTES,
  GAP_DEFAULT_MIN_MINUTES,
  WEEKDAYS,
} from "../../../../../packages/core/src/mail/index.js"

export type MailboxFormValues = {
  fromName: string
  email: string
  presetId: string
  smtpHost: string
  smtpPort: string
  smtpSecurity: string
  smtpUsername: string
  smtpPassword: string
  imapHost: string
  imapPort: string
  imapSecurity: string
  imapUsername: string
  imapPassword: string
  dailyCap: string
  sendingDays: string[]
  windowStart: string
  windowEnd: string
  timeZone: string
  minGapMinutes: string
  maxGapMinutes: string
  signature: string
}

export function emptyMailboxForm(): MailboxFormValues {
  const custom = findPreset("custom")
  return {
    fromName: "",
    email: "",
    presetId: "custom",
    smtpHost: custom?.smtp.host ?? "",
    smtpPort: String(custom?.smtp.port ?? 587),
    smtpSecurity: custom?.smtp.security ?? "starttls",
    smtpUsername: "",
    smtpPassword: "",
    imapHost: custom?.imap.host ?? "",
    imapPort: String(custom?.imap.port ?? 993),
    imapSecurity: custom?.imap.security ?? "ssl",
    imapUsername: "",
    imapPassword: "",
    dailyCap: String(DAILY_CAP_DEFAULT),
    sendingDays: [...DEFAULT_SENDING_DAYS],
    windowStart: DEFAULT_WINDOW_START,
    windowEnd: DEFAULT_WINDOW_END,
    timeZone: DEFAULT_TIME_ZONE,
    minGapMinutes: String(GAP_DEFAULT_MIN_MINUTES),
    maxGapMinutes: String(GAP_DEFAULT_MAX_MINUTES),
    signature: "",
  }
}

export function MailboxForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
}: {
  initial: MailboxFormValues
  submitLabel: string
  busy: boolean
  error: string | null
  onSubmit: (values: MailboxFormValues) => void
}) {
  const [values, setValues] = useState(initial)
  const zones = timeZones()

  function applyPreset(presetId: string) {
    const preset = findPreset(presetId)
    setValues((current) => ({
      ...current,
      presetId,
      smtpHost: preset?.smtp.host ?? current.smtpHost,
      smtpPort: String(preset?.smtp.port ?? current.smtpPort),
      smtpSecurity: preset?.smtp.security ?? current.smtpSecurity,
      imapHost: preset?.imap.host ?? current.imapHost,
      imapPort: String(preset?.imap.port ?? current.imapPort),
      imapSecurity: preset?.imap.security ?? current.imapSecurity,
      smtpUsername: preset?.usernameIsEmail ? current.email : current.smtpUsername,
      imapUsername: preset?.usernameIsEmail ? current.email : current.imapUsername,
    }))
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(values)
      }}
    >
      <label className="block text-sm">
        Preset
        <select className={fieldClass} value={values.presetId} onChange={(event) => applyPreset(event.target.value)}>
          {listPresets().map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">{findPreset(values.presetId)?.help}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From name" value={values.fromName} onChange={(fromName) => setValues({ ...values, fromName })} />
        <Field label="Email" value={values.email} onChange={(email) => setValues({ ...values, email, smtpUsername: email, imapUsername: email })} />
        <Field label="SMTP host" value={values.smtpHost} onChange={(smtpHost) => setValues({ ...values, smtpHost })} />
        <Field label="SMTP port" value={values.smtpPort} onChange={(smtpPort) => setValues({ ...values, smtpPort })} />
        <Security label="SMTP security" value={values.smtpSecurity} onChange={(smtpSecurity) => setValues({ ...values, smtpSecurity })} />
        <Field label="SMTP username" value={values.smtpUsername} onChange={(smtpUsername) => setValues({ ...values, smtpUsername })} />
        <Field label="SMTP password" value={values.smtpPassword} secret onChange={(smtpPassword) => setValues({ ...values, smtpPassword })} />
        <Field label="IMAP host" value={values.imapHost} onChange={(imapHost) => setValues({ ...values, imapHost })} />
        <Field label="IMAP port" value={values.imapPort} onChange={(imapPort) => setValues({ ...values, imapPort })} />
        <Security label="IMAP security" value={values.imapSecurity} onChange={(imapSecurity) => setValues({ ...values, imapSecurity })} />
        <Field label="IMAP username" value={values.imapUsername} onChange={(imapUsername) => setValues({ ...values, imapUsername })} />
        <Field label="IMAP password" value={values.imapPassword} secret onChange={(imapPassword) => setValues({ ...values, imapPassword })} />
        <Field label="Daily cap (max 50)" value={values.dailyCap} onChange={(dailyCap) => setValues({ ...values, dailyCap })} />
        <Field label="Minimum gap (minutes)" value={values.minGapMinutes} onChange={(minGapMinutes) => setValues({ ...values, minGapMinutes })} />
        <Field label="Maximum gap (minutes)" value={values.maxGapMinutes} onChange={(maxGapMinutes) => setValues({ ...values, maxGapMinutes })} />
        <Field label="Window start" value={values.windowStart} onChange={(windowStart) => setValues({ ...values, windowStart })} />
        <Field label="Window end" value={values.windowEnd} onChange={(windowEnd) => setValues({ ...values, windowEnd })} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm">Sending days</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {WEEKDAYS.map((day) => (
            <label key={day} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={values.sendingDays.includes(day)}
                onChange={(event) => {
                  const sendingDays = event.target.checked
                    ? [...values.sendingDays, day]
                    : values.sendingDays.filter((item) => item !== day)
                  setValues({ ...values, sendingDays })
                }}
              />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">
        Time zone
        <select className={fieldClass} value={values.timeZone} onChange={(event) => setValues({ ...values, timeZone: event.target.value })}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>{zone}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Signature
        <textarea className={fieldClass} rows={4} value={values.signature} onChange={(event) => setValues({ ...values, signature: event.target.value })} />
      </label>
      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  )
}

function Field({ label, value, onChange, secret = false }: { label: string; value: string; onChange: (value: string) => void; secret?: boolean }) {
  return (
    <label className="block text-sm">
      {label}
      <input className={fieldClass} type={secret ? "password" : "text"} value={value} autoComplete="off" onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function Security({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      {label}
      <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="ssl">SSL</option>
        <option value="starttls">STARTTLS</option>
        <option value="none">None</option>
      </select>
    </label>
  )
}

function timeZones(): string[] {
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    return Intl.supportedValuesOf("timeZone")
  }
  return [DEFAULT_TIME_ZONE]
}

const fieldClass = "mt-1 w-full rounded-md border bg-background px-2 py-1"
