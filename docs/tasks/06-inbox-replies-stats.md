# Task 06 — Inbox, replies, bounces, stats (after 05 is merged)
Lane: `apps/worker/src/inbox/**`, `apps/server/src/inbox/**`, `apps/server/src/stats/**`, `apps/web/src/pages/inbox/**`, `apps/web/src/pages/dashboard/**`.
Build spec §3.6 and §3.7: IMAP polling of new UIDs, reply matching, auto-reply labels (don't stop), bounces → suppressed, unified inbox with thread view + reply in-thread + interested/not interested, campaign/step/mailbox stats, first-run guided setup (§7). Tests for reply matching, auto-reply detection, DSN parsing.
