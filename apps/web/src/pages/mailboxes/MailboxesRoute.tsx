import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, api } from "@/lib/api";
import type { DeliverabilityReport } from "../../../../../packages/core/src/dns/types.js";
import { MailboxesPage, type ConnectionMessage } from "./MailboxesPage.js";
import { microsoftButton, type MailboxCard } from "./view-model.js";

const MICROSOFT_NOTES: Record<string, string> = {
  connected: "Microsoft mailbox connected.",
  denied: "Microsoft sign-in was cancelled.",
  state: "That Microsoft sign-in link expired. Start again.",
  "not-configured": "Microsoft sign-in is not configured.",
  token: "Microsoft did not return a usable token.",
  "missing-code": "Microsoft did not return a code.",
  "missing-email": "Microsoft did not include an email address.",
};

export function MailboxesRoute() {
  const [searchParams] = useSearchParams();
  const [mailboxes, setMailboxes] = useState<MailboxCard[]>([]);
  const [deliverability, setDeliverability] = useState<Record<string, DeliverabilityReport>>({});
  const [microsoft, setMicrosoft] = useState(microsoftButton({ available: false, message: "Checking Microsoft sign-in…" }));
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, availability] = await Promise.all([
      api<{ mailboxes: MailboxCard[] }>("/api/mailboxes"),
      api<{ available: boolean; message?: string }>("/api/oauth/microsoft/availability"),
    ]);
    setMailboxes(list.mailboxes);
    setMicrosoft(microsoftButton(availability));
    const reports: Record<string, DeliverabilityReport> = {};
    await Promise.all(
      list.mailboxes.map(async (mailbox) => {
        try {
          const body = await api<{ deliverability: DeliverabilityReport }>(`/api/mailboxes/${mailbox.id}/deliverability`);
          reports[mailbox.id] = body.deliverability;
        } catch {
          // A DNS failure for one mailbox stays on that card once it loads; a missing card is not a page error.
        }
      }),
    );
    setDeliverability(reports);
  }, []);

  useEffect(() => {
    const note = searchParams.get("microsoft");
    setNotice(note ? (MICROSOFT_NOTES[note] ?? "Microsoft sign-in did not finish.") : null);
    void load().catch((error: unknown) => {
      setLoadError(error instanceof ApiError ? error.message : "Could not load mailboxes.");
    });
  }, [load, searchParams]);

  return (
    <div className="space-y-4">
      {notice ? <p className="text-sm">{notice}</p> : null}
      {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}
      <MailboxesPage
        mailboxes={mailboxes}
        microsoft={microsoft}
        deliverability={deliverability}
        onCreate={async (values) => {
          try {
            await api("/api/mailboxes", { method: "POST", body: JSON.stringify({ ...values, provider: "smtp" }) });
            await load();
            return null;
          } catch (error) {
            return error instanceof ApiError ? error.message : "Could not save the mailbox.";
          }
        }}
        onTest={async (id) => {
          const body = await api<{ connection: ConnectionMessage }>(`/api/mailboxes/${id}/test`, { method: "POST" });
          return body.connection;
        }}
        onReconnect={async (id, values) => {
          try {
            await api(`/api/mailboxes/${id}/reconnect`, { method: "POST", body: JSON.stringify(values) });
            await load();
            return null;
          } catch (error) {
            return error instanceof ApiError ? error.message : "Could not reconnect the mailbox.";
          }
        }}
      />
    </div>
  );
}
