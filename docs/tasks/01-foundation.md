# Task 01 — Foundation (runs alone, everything else waits for it)

Build milestone 1 of `docs/BUILD-SPEC.md` **plus the shared base every later task builds on**:
- pnpm monorepo layout from spec §2 (`apps/server`, `apps/worker`, `apps/web`, `packages/core`, `skills/`, `docs/`).
- **The complete Drizzle schema for ALL v1 features** in `packages/core/src/db/schema.ts` + first migration: users, invites, sessions, api_keys, settings (incl. WarmySender key, encrypted), mailboxes (SMTP/IMAP + Microsoft OAuth fields, caps, window, timezone, gaps, ramp start date, health/paused reason, encrypted secrets), contacts (+ custom fields JSON, status), lists, list_members, suppressions (email | domain), campaigns, campaign_steps, campaign_mailboxes, enrollments (current step, next send at, assigned mailbox, status), messages (sent: message-id, thread refs, mailbox, step, contact, status, error), inbound_messages (replies/auto-replies/bounces, matched enrollment), reply_drafts, unsubscribe_tokens, job/audit log. Indexes for the scheduler queries.
- Encryption helper (AES-256-GCM from `ENCRYPTION_KEY`), config loader that validates env with clear errors.
- Auth: email + password, first visitor = admin, invite links, sessions; API keys (hashed, shown once).
- pg-boss wired in `apps/worker` with a heartbeat job; Express server with health endpoint; React + Vite + Tailwind + shadcn shell with sidebar nav placeholders for: Dashboard, Mailboxes, Contacts, Campaigns, Inbox, Settings (light + dark, WarmySender green accent).
- `Dockerfile`, `docker-compose.yml` (app, worker, postgres; optional `mailpit` profile), `.env.example` with every variable documented inline.
- Repo files from spec §7: `AGENTS.md`, `CLAUDE.md`, `.github/workflows/ci.yml` (install, typecheck, lint, test), `codeql.yml`, `.github/dependabot.yml`, `SUPPORT.md`, `CHANGELOG.md` (Unreleased).
- Tests: auth (first user admin, invite), API key hashing, encryption round trip, env validation.

Done = PR to `main` with green CI.
