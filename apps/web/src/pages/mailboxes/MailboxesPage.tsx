import { useState } from "react"
import type { DeliverabilityReport } from "../../../../../packages/core/src/dns/types.js"
import { DeliverabilityCard } from "./DeliverabilityCard.js"
import { MailboxForm, emptyMailboxForm, type MailboxFormValues } from "./MailboxForm.js"
import { capLine, type MailboxCard, type MicrosoftButton } from "./view-model.js"

export type ConnectionMessage = {
  ok: boolean
  smtp: { ok: boolean; message: string }
  imap: { ok: boolean; message: string }
}

export function MailboxesPage({
  mailboxes,
  microsoft,
  deliverability,
  onCreate,
  onTest,
  onReconnect,
}: {
  mailboxes: MailboxCard[]
  microsoft: MicrosoftButton
  deliverability: Record<string, DeliverabilityReport>
  onCreate: (values: MailboxFormValues) => Promise<string | null>
  onTest: (id: string) => Promise<ConnectionMessage>
  onReconnect: (id: string, values: { smtpPassword: string; imapPassword: string }) => Promise<string | null>
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<Record<string, ConnectionMessage>>({})

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Mailboxes</h1>
        <p className="text-sm text-muted-foreground">
          Daily cap defaults to 30 and cannot go above 50. New mailboxes ramp: 10 a day for the first week, then 20, then the mailbox cap.
        </p>
      </header>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-medium">Microsoft 365 / Outlook</h2>
        {microsoft.available ? (
          <a className="inline-block rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href={microsoft.startPath}>
            Sign in with Microsoft
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">{microsoft.message}</p>
        )}
      </section>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-medium">SMTP / IMAP</h2>
        <MailboxForm
          initial={emptyMailboxForm()}
          submitLabel="Save mailbox"
          busy={busy}
          error={error}
          onSubmit={(values) => {
            setBusy(true)
            setError(null)
            void onCreate(values).then(
              (message) => {
                setError(message)
                setBusy(false)
              },
              () => {
                setError("Could not save the mailbox.")
                setBusy(false)
              },
            )
          }}
        />
      </section>
      <ul className="space-y-4">
        {mailboxes.map((mailbox) => {
          const report = deliverability[mailbox.id]
          return (
            <li key={mailbox.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div>
                <h2 className="text-lg font-medium">{mailbox.fromName}</h2>
                <p className="text-sm text-muted-foreground">{mailbox.email}</p>
                <p className="text-sm">{capLine(mailbox)}</p>
                <p className="text-sm text-muted-foreground">
                  {mailbox.sendingDays.join(", ")} {mailbox.windowStart}–{mailbox.windowEnd} {mailbox.timeZone}. Gap {mailbox.minGapMinutes}–{mailbox.maxGapMinutes} min.
                </p>
              </div>
              {mailbox.paused ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
                  {mailbox.pauseReason}{" "}
                  {mailbox.provider === "microsoft" ? (
                    <a className="font-medium text-green-700 underline dark:text-green-300" href={microsoft.startPath}>Reconnect</a>
                  ) : null}
                </p>
              ) : null}
              {mailbox.provider === "smtp" && mailbox.paused ? (
                <ReconnectForm
                  onSubmit={(passwords) => onReconnect(mailbox.id, passwords)}
                />
              ) : null}
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => {
                  void onTest(mailbox.id).then((result) => {
                    setConnection((current) => ({ ...current, [mailbox.id]: result }))
                  })
                }}
              >
                Test connection
              </button>
              {connection[mailbox.id] ? (
                <div className="text-sm">
                  <p>{connection[mailbox.id]?.smtp.message}</p>
                  <p>{connection[mailbox.id]?.imap.message}</p>
                </div>
              ) : null}
              {report ? <DeliverabilityCard report={report} /> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ReconnectForm({ onSubmit }: { onSubmit: (values: { smtpPassword: string; imapPassword: string }) => Promise<string | null> }) {
  const [smtpPassword, setSmtpPassword] = useState("")
  const [imapPassword, setImapPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit({ smtpPassword, imapPassword }).then(setMessage)
      }}
    >
      <label className="block text-sm">
        New SMTP password
        <input className="mt-1 w-full rounded-md border px-2 py-1" type="password" autoComplete="off" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} />
      </label>
      <label className="block text-sm">
        New IMAP password
        <input className="mt-1 w-full rounded-md border px-2 py-1" type="password" autoComplete="off" value={imapPassword} onChange={(event) => setImapPassword(event.target.value)} />
      </label>
      <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Reconnect</button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  )
}
