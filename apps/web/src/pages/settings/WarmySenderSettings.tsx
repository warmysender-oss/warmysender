import { useState } from "react";
import { FindLeadsLink } from "./FindLeadsLink";
import { VerifyListButton, type VerifyUpdate } from "./VerifyListButton";
import { WarmupMailboxButton } from "./WarmupMailboxButton";

export type WarmySenderSettingsProps = {
  connected: boolean;
  sampleEmails: string[];
  sampleMailbox: { id: string; email: string; kind: "smtp" | "microsoft" };
  onSaveKey: (apiKey: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onVerify: (emails: string[]) => Promise<{ updates: VerifyUpdate[]; incomplete: boolean }>;
  onWarmup: (mailboxId: string) => Promise<{ summary: string }>;
};

export function WarmySenderSettingsPage(props: WarmySenderSettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await props.onSaveKey(apiKey);
      setApiKey("");
      setMessage("WarmySender is connected. The key is stored encrypted and is not shown again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save that key.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">WarmySender</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          Optional. Verification, warmup, and leads use a WarmySender API key. The rest of the app works without one.
        </p>
      </header>

      <form className="space-y-3" onSubmit={(event) => void save(event)}>
        <label className="block text-sm" htmlFor="warmy-key">
          API key
        </label>
        <input
          id="warmy-key"
          type="password"
          autoComplete="off"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          value={apiKey}
          placeholder="ws_…"
          onChange={(event) => setApiKey(event.target.value)}
        />
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-60" disabled={pending || apiKey.length === 0}>
            Save key
          </button>
          {props.connected ? (
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm"
              onClick={() => void props.onDisconnect().then(() => setMessage("Disconnected."))}
            >
              Disconnect
            </button>
          ) : null}
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
      </form>

      <VerifyListButton connected={props.connected} emails={props.sampleEmails} onVerify={props.onVerify} />
      <WarmupMailboxButton connected={props.connected} mailbox={props.sampleMailbox} onWarmup={props.onWarmup} />
      <FindLeadsLink connected={props.connected} />
    </section>
  );
}
