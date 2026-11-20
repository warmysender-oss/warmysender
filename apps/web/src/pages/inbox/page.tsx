import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { inboxBadge, interestLabel } from "@/pages/inbox/inbox-list";

interface InboxMessage {
  id: string;
  at: string;
  direction: "in" | "out";
  subject: string;
  from: string;
  bodyText: string;
  kind: string;
  interest: "interested" | "not_interested" | null;
}

interface InboxThread {
  key: string;
  mailboxId: string;
  contactId: string | null;
  subject: string;
  latestAt: string;
  badge: string;
  interest: "interested" | "not_interested" | null;
  messages: InboxMessage[];
}

export function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    const data = await api<{ threads: InboxThread[] }>("/api/inbox");
    setThreads(data.threads);
    setSelectedKey((current) => current ?? data.threads[0]?.key ?? null);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load the inbox."));
  }, []);

  const selected = threads.find((thread) => thread.key === selectedKey) ?? null;

  async function mark(messageId: string, interest: "interested" | "not_interested") {
    setError(null);
    try {
      await api(`/api/inbox/messages/${messageId}/interest`, {
        method: "POST",
        body: JSON.stringify({ interest }),
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not update interest.");
    }
  }

  async function reply() {
    if (!selected?.contactId) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/inbox/threads/${selected.mailboxId}/${selected.contactId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setBody("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not send the reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[320px_1fr]">
      <div>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">Replies across mailboxes. Auto-replies stay labelled and do not stop a sequence.</p>
        <div className="mt-4 space-y-2">
          {threads.length === 0 ? <p className="text-sm text-muted-foreground">No replies yet.</p> : null}
          {threads.map((thread) => (
            <button
              key={thread.key}
              type="button"
              onClick={() => setSelectedKey(thread.key)}
              className={`w-full rounded-lg border p-3 text-left ${thread.key === selectedKey ? "border-primary bg-primary/5" : "bg-card"}`}
            >
              <span className="block text-sm font-medium">{thread.subject || "(no subject)"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{thread.badge}</span>
            </button>
          ))}
        </div>
      </div>
      <Card className="p-6">
        {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
        {!selected ? <p className="text-sm text-muted-foreground">Select a thread.</p> : null}
        {selected ? (
          <div>
            <h2 className="text-lg font-medium">{selected.subject || "(no subject)"}</h2>
            {interestLabel(selected.interest) ? (
              <p className="mt-1 text-sm text-primary">{interestLabel(selected.interest)}</p>
            ) : null}
            <div className="mt-4 space-y-4">
              {selected.messages.map((message) => {
                const badge = inboxBadge(message.kind);
                return (
                  <article key={message.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{message.from}</p>
                      <p className="text-xs text-muted-foreground">{badge.label}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{message.bodyText}</p>
                    {message.kind === "reply" ? (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void mark(message.id, "interested")}>
                          Interested
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void mark(message.id, "not_interested")}>
                          Not interested
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            {selected.contactId ? (
              <form
                className="mt-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void reply();
                }}
              >
                <label className="text-sm font-medium" htmlFor="reply-body">
                  Reply in this thread
                </label>
                <textarea
                  id="reply-body"
                  className="mt-2 min-h-28 w-full rounded-md border bg-background p-3 text-sm"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
                <Button className="mt-3" type="submit" disabled={sending || body.trim().length === 0}>
                  {sending ? "Sending…" : "Send reply"}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
