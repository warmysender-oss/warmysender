import type { DeliverabilityReport } from "../../../../../packages/core/src/dns/types.js"

const STATUS_CLASS = {
  pass: "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100",
  warn: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  fail: "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  unknown: "border bg-muted text-foreground",
} as const

export function DeliverabilityCard({ report }: { report: DeliverabilityReport }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Deliverability</h3>
      <p className="text-sm text-muted-foreground">
        DNS only, for {report.domain}. This check does not connect to the mail server.
      </p>
      {report.launchWarning ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {report.launchWarning}
        </p>
      ) : null}
      <ul className="space-y-2">
        {report.checks.map((check) => (
          <li key={check.id} className={`rounded-md border p-3 text-sm ${STATUS_CLASS[check.status]}`}>
            <p className="font-medium uppercase tracking-wide">{check.id}</p>
            <p>{check.summary}</p>
            {check.fix ? <p className="mt-1">{check.fix}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
