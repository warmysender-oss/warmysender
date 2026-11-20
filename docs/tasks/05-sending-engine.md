# Task 05 — Sending engine (after 02 and 03 are merged)
Lane: `apps/worker/**`, `packages/core/src/scheduler/**`, `packages/core/src/mail/send*`, unsubscribe route `apps/server/src/unsubscribe/**`.
Build spec §3.5 + the threading and unsubscribe parts of §3.4: windows, caps incl. ramp, random gaps, one send at a time per mailbox, re-checks before send, In-Reply-To/References, List-Unsubscribe + One-Click POST, retries/backoff, 5xx → bounced, structured decision logs. Tests prove every safety rule in spec §6, plus a Mailpit send test for threading headers.
