import { useState } from "react";
import { WarmySenderConnectCard } from "./WarmySenderConnectCard";

export type VerifyUpdate = { email: string; status: string; verification: string };

export function VerifyListButton({
  connected,
  emails,
  onVerify,
}: {
  connected: boolean;
  emails: string[];
  onVerify: (emails: string[]) => Promise<{ updates: VerifyUpdate[]; incomplete: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const result = await onVerify(emails);
      const invalid = result.updates.filter((item) => item.status === "invalid").length;
      const risky = result.updates.filter((item) => item.status === "risky").length;
      setMessage(
        `Updated ${result.updates.length}. Invalid ${invalid}. Risky ${risky}.${result.incomplete ? " The run is still going." : ""}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="rounded-md bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-60"
        onClick={() => setOpen(true)}
      >
        Verify list
      </button>
      {open && !connected ? <WarmySenderConnectCard feature="verify" /> : null}
      {open && connected ? (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p>Check {emails.length} addresses with WarmySender. Results update contact status here.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-md bg-green-700 px-3 py-2 text-white disabled:opacity-60" disabled={pending} onClick={() => void run()}>
              {pending ? "Checking…" : "Start verification"}
            </button>
            <button type="button" className="rounded-md px-3 py-2" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {message ? <p className="mt-3">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
