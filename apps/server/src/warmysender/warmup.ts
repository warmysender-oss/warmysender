import { WarmySenderApiError, type WarmupStats, type WarmySenderClient } from "./client.js";
import { MICROSOFT_MAILBOX_URL, MICROSOFT_WARMUP_MESSAGE, WARMUP_CONFIRMATION } from "./links.js";

export type WarmupMailboxInput = {
  id: string;
  fromName: string | null;
  email: string;
  kind: "smtp" | "microsoft";
  smtp: { host: string; port: number; username: string; password: string } | null;
  imap: { host: string; port: number; username: string; password: string } | null;
};

export type WarmupOutcome =
  | { status: "confirmation_required"; message: string }
  | { status: "microsoft"; message: string; url: string }
  | { status: "missing_login"; message: string }
  | { status: "connection_failed"; warmysender_mailbox_id: string; error: string | null }
  | { status: "still_testing"; warmysender_mailbox_id: string }
  | { status: "warming"; warmysender_mailbox_id: string; restored: boolean; stats: WarmupStats };

/**
 * SMTP/IMAP: after an explicit confirm, POST /mailboxes, poll GET /mailboxes/{id}
 * until the connection test finishes (the create operation says to poll), then
 * PATCH /warmup/settings/{id} and GET /warmup/stats/{id}.
 * Microsoft: no credentials are sent. The person connects that mailbox inside WarmySender.
 */
export async function warmUpMailbox(
  client: WarmySenderClient,
  mailbox: WarmupMailboxInput,
  options: { confirmed: boolean; maxPolls?: number; sleep?: (ms: number) => Promise<void> },
): Promise<WarmupOutcome> {
  if (mailbox.kind === "microsoft") {
    return { status: "microsoft", message: MICROSOFT_WARMUP_MESSAGE, url: MICROSOFT_MAILBOX_URL };
  }
  if (!options.confirmed) {
    return { status: "confirmation_required", message: WARMUP_CONFIRMATION };
  }
  if (!mailbox.smtp || !mailbox.imap) {
    return { status: "missing_login", message: "This mailbox has no SMTP and IMAP login to send." };
  }

  const idempotencyKey = `oss-warmup-${mailbox.id}`;
  let warmyId: string;
  let restored = false;
  try {
    const created = await client.createMailbox(
      {
        email_address: mailbox.email,
        display_name: mailbox.fromName ?? undefined,
        external_id: mailbox.id,
        smtp_host: mailbox.smtp.host,
        smtp_port: mailbox.smtp.port,
        smtp_username: mailbox.smtp.username,
        smtp_password: mailbox.smtp.password,
        imap_host: mailbox.imap.host,
        imap_port: mailbox.imap.port,
        imap_username: mailbox.imap.username,
        imap_password: mailbox.imap.password,
      },
      idempotencyKey,
    );
    warmyId = created.mailbox.id;
    restored = created.statusCode === 200;
  } catch (error) {
    if (error instanceof WarmySenderApiError && error.code === "duplicate_email") {
      const existing = await client.listMailboxesByEmail(mailbox.email);
      const match = existing.find((item) => item.email_address.toLowerCase() === mailbox.email.toLowerCase());
      if (!match) throw error;
      warmyId = match.id;
      restored = true;
    } else {
      throw error;
    }
  }

  const maxPolls = options.maxPolls ?? 15;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let current = await client.getMailbox(warmyId);
  let polls = 0;
  while ((current.status === "created" || current.status === "testing") && polls < maxPolls) {
    await sleep(2_000);
    current = await client.getMailbox(warmyId);
    polls += 1;
  }
  if (current.status === "error" || current.status === "deleted") {
    return { status: "connection_failed", warmysender_mailbox_id: warmyId, error: current.last_test_error ?? null };
  }
  if (current.status !== "connected") {
    return { status: "still_testing", warmysender_mailbox_id: warmyId };
  }

  await client.updateWarmupSettings(warmyId, { warmup_enabled: true });
  const stats = await client.getWarmupStats(warmyId);
  return { status: "warming", warmysender_mailbox_id: warmyId, restored, stats };
}
