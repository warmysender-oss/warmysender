import { useState } from "react";
import { WarmySenderConnectCard } from "./WarmySenderConnectCard";
import { MICROSOFT_MAILBOX_URL, MICROSOFT_WARMUP_MESSAGE, WARMUP_CONFIRMATION } from "./warmysender-links";

export function WarmupMailboxButton({
  connected,
  mailbox,
  onWarmup,
}: {
  connected: boolean;
  mailbox: { id: string; email: string; kind: "smtp" | "microsoft" };
  onWarmup: (mailboxId: string) => Promise<{ summary: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setMessage(null);
    try {
      const result = await onWarmup(mailbox.id);
      setMessage(result.summary);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Warmup failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" className="rounded-md bg-green-700 px-3 py-2 text-sm text-white" onClick={() => setOpen(true)}>
        Warm up this mailbox
      </button>
      {open && !connected ? <WarmySenderConnectCard feature="warmup" /> : null}
      {open && connected && mailbox.kind === "microsoft" ? (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p>{MICROSOFT_WARMUP_MESSAGE}</p>
          <a className="mt-3 inline-flex text-green-700 underline dark:text-green-400" href={MICROSOFT_MAILBOX_URL}>
            Connect this mailbox in WarmySender to warm it up
          </a>
        </div>
      ) : null}
      {open && connected && mailbox.kind === "smtp" ? (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800" role="dialog" aria-label="Confirm warmup">
          <p>{WARMUP_CONFIRMATION}</p>
          <p className="mt-2 text-neutral-500">{mailbox.email}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-md bg-green-700 px-3 py-2 text-white disabled:opacity-60" disabled={pending} onClick={() => void confirm()}>
              {pending ? "Sending login…" : "Send login and warm up"}
            </button>
            <button type="button" className="rounded-md px-3 py-2" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {message ? <p className="mt-3">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
