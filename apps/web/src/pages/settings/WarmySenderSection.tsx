import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FindLeadsLink } from "./FindLeadsLink";
import { VerifyListButton, type VerifyUpdate } from "./VerifyListButton";
import { WarmupMailboxButton } from "./WarmupMailboxButton";

type Connection = { connected: boolean };
type MailboxChoice = { id: string; email: string; kind: "smtp" | "microsoft" };

async function warmy<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { data?: T; error?: { message?: string } | string }) : {};
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(message || "Request failed.");
  }
  return body.data as T;
}

export function WarmySenderSection() {
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [emails, setEmails] = useState("jane@harbor-dental.test");
  const [mailboxes, setMailboxes] = useState<MailboxChoice[]>([]);
  const [mailboxId, setMailboxId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const status = await warmy<Connection>("/api/settings/warmysender");
    setConnected(status.connected);
    const rows = await warmy<MailboxChoice[]>("/api/warmysender/mailboxes");
    setMailboxes(rows);
    setMailboxId((current) => current || rows[0]?.id || "");
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load WarmySender."));
  }, []);

  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await warmy("/api/settings/warmysender", { method: "PUT", body: JSON.stringify({ api_key: apiKey }) });
      setApiKey("");
      setConnected(true);
      setMessage("WarmySender is connected. The key is stored encrypted and is not shown again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save that key.");
    } finally {
      setPending(false);
    }
  }

  const mailbox = mailboxes.find((row) => row.id === mailboxId) ?? null;
  const emailList = emails
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">WarmySender</h2>
      <p className="text-sm text-muted-foreground">
        Optional. Verification, warmup, and leads use a WarmySender API key. The rest of the app works without one. Tools never send mail or raise a limit.
      </p>
      <Card className="space-y-6 p-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="warmy-key">API key</Label>
            <Input
              id="warmy-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder="ws_…"
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || apiKey.length === 0}>
              Save key
            </Button>
            {connected ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void warmy("/api/settings/warmysender", { method: "DELETE" }).then(() => {
                    setConnected(false);
                    setMessage("Disconnected.");
                  });
                }}
              >
                Disconnect
              </Button>
            ) : null}
          </div>
          {message ? <p className="text-sm">{message}</p> : null}
        </form>

        <div className="space-y-2">
          <Label htmlFor="verify-emails">Addresses to verify</Label>
          <textarea
            id="verify-emails"
            className="min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm"
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
          />
        </div>
        <VerifyListButton
          connected={connected}
          emails={emailList}
          onVerify={async (list) => {
            const data = await warmy<{ updates: VerifyUpdate[]; incomplete?: boolean }>("/api/warmysender/verify", {
              method: "POST",
              body: JSON.stringify({ emails: list }),
            });
            return { updates: data.updates ?? [], incomplete: Boolean(data.incomplete) };
          }}
        />

        {mailbox ? (
          <WarmupMailboxButton
            connected={connected}
            mailbox={mailbox}
            onWarmup={async (id) => {
              const data = await warmy<{ status?: string; warmysender_mailbox_id?: string }>(
                `/api/warmysender/mailboxes/${id}/warmup`,
                { method: "POST", body: JSON.stringify({ confirmed: true }) },
              );
              return { summary: data.status === "warming" ? "Warmup is on." : `Warmup: ${data.status ?? "done"}.` };
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Add a mailbox before warming one up. The confirm step sends that mailbox login to WarmySender.</p>
        )}
        {mailboxes.length > 1 ? (
          <label className="block text-sm">
            Mailbox
            <select className="mt-1 flex h-10 w-full rounded-md border bg-card px-3 text-sm" value={mailboxId} onChange={(event) => setMailboxId(event.target.value)}>
              {mailboxes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <FindLeadsLink connected={connected} />
      </Card>
    </section>
  );
}
