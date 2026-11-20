# WarmySender (open source) — Build Spec v1

**What we are building:** an open-source, self-hostable cold email app by WarmySender — "the open-source Instantly alternative". AGPL-3.0. People run it on their own server with their own mailboxes. Anyone who wants the hosted product, or paid extras (warmup network, email verification, leads, LinkedIn), signs up at https://warmysender.com through the normal sign-up. The app is a new way in at the top of the funnel; nothing about WarmySender's pricing or sign-up changes.

**Done for v1 =** a stranger can run `docker compose up`, create an account, connect a mailbox, import a CSV, build a 3-step sequence, launch it, watch it send inside safe limits, see replies stop the sequence, and drive all of it from an AI agent over MCP.

---

## 1. Hard rules (read first, never break)

1. **Write fresh code.** This repo must contain nothing from the private WarmySender product repo: no copied code comments, no support-ticket ids (`WS-1234`, `LL#`, `GL#`), no customer names or email addresses, no server IPs, no names of WarmySender's internal infrastructure vendors. You may *read* product behaviour described in this spec; you never paste internal code.
2. **No secrets in git.** Only `.env.example` with empty values. Never commit real keys, tokens or passwords. Never print secrets in logs.
3. **Safety limits are code, not settings people can blow past:** per-mailbox daily cap (default 30, hard max 50), sending window, random gap between sends, ramp for new mailboxes, stop on reply, stop on bounce, global suppression, one-click unsubscribe. An agent can never raise a limit.
4. **Agents never send a message directly.** MCP/API tools create and start campaigns; the scheduler sends. Reply drafting saves a draft a human sends from the inbox.
5. **Demo and test data use `.test` domains only** (e.g. `jane@harbor-dental.test`). No real people.
6. **Work on your own branch and open a PR to `main`** (see `docs/tasks/00-RULES-FOR-EVERY-AGENT.md`). Never push to `main` directly — the reviewer (Claude) checks and merges each PR.
7. Keep the machine responsive (16 GB Mac): one dev server at a time, stop containers you started when a milestone is done.

## 2. Stack (chosen for easy self-hosting and forking)

- Node 22, TypeScript (strict), pnpm.
- Server: Express + Drizzle ORM + PostgreSQL 16.
- Jobs: **pg-boss** (queue in Postgres, so self-hosters need no Redis).
- Mail: `nodemailer` (SMTP, XOAUTH2), `imapflow` (IMAP), `mailparser`.
- Web: React + Vite + Tailwind + shadcn/ui; clean, bright, premium look (WarmySender green accent `#16a34a`-ish, light + dark mode).
- MCP: `@modelcontextprotocol/sdk`, Streamable HTTP at `/mcp`, auth = app API key.
- Tests: vitest. Lint: eslint. Single `Dockerfile` + `docker-compose.yml` (app + worker + postgres).
- Mailbox secrets encrypted at rest (AES-256-GCM, key from `ENCRYPTION_KEY`).

Layout:
```
apps/server   (Express API, MCP, auth)
apps/worker   (pg-boss jobs: sending, inbox polling, bounces)   — may share code with server via packages/core
apps/web      (React UI)
packages/core (db schema, scheduler rules, mail helpers)
skills/       (agent skills, SKILL.md files)
docs/         (self-hosting, Microsoft app setup, API, MCP)
```

## 3. Features

### 3.1 Install and accounts
- `docker compose up` → app on `http://localhost:3000`. Env: `DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET`, `PUBLIC_URL` (needed for unsubscribe links), optional `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT` (`common` default).
- Email + password accounts. **First visitor becomes admin**; admin invites teammates by link. No email sending needed for auth.
- Settings → API keys (create, name, revoke; shown once; stored hashed).

### 3.2 Mailboxes
- **Any SMTP/IMAP host**: presets for Gmail / Google Workspace (App Password), Zoho, Hostinger, Fastmail, custom. Fields: from name, email, SMTP host/port/security/user/pass, IMAP host/port/security/user/pass. "Test connection" checks both SMTP login and IMAP login and shows a plain-language error.
- **Microsoft 365 / Outlook**: "Sign in with Microsoft" using the **self-hoster's own** Entra app (`MS_CLIENT_ID`/`MS_CLIENT_SECRET`); SMTP + IMAP with XOAUTH2; refresh tokens stored encrypted. If env vars are missing, the button explains how to create the app (`docs/MICROSOFT-APP.md`, step by step, with the exact redirect URL `${PUBLIC_URL}/api/oauth/microsoft/callback` and scopes `offline_access https://outlook.office.com/SMTP.Send https://outlook.office.com/IMAP.AccessAsUser.All openid email`).
- Per mailbox: daily cap (default 30, max 50), sending days + window + timezone, min/max random gap (default 4–9 minutes), signature.
- **New-mailbox ramp:** days 1–7 cap 10/day, days 8–14 cap 20/day, then the mailbox's own cap. Shown in the UI ("Day 3 of ramp: 10 a day").
- Auth failure on send or IMAP 3 times in a row → mailbox paused with a clear "Reconnect" message. Never retry a failing login in a tight loop.

### 3.3 Contacts
- CSV import with column mapping (email required; first_name, last_name, company, title, custom fields kept as JSON). Dedupe by lower-cased email. Shows "imported / skipped (duplicate, invalid syntax, suppressed)".
- Lists (a contact can be in many lists). Contact statuses: active, replied, bounced, unsubscribed, invalid, risky.
- Global suppression list (emails and whole domains). Unsubscribed and bounced contacts are added automatically.

### 3.4 Campaigns (sequences)
- Steps: email steps with subject + body and a delay in days after the previous step (step 1 delay 0). Variables `{{first_name}}`, `{{company}}`, any custom field, with fallback `{{first_name|there}}`. Preview with a real contact before launch.
- Follow-ups go **in the same thread** (same subject with "Re:" unless the step sets its own; `In-Reply-To` / `References` set from the previous message id).
- Choose mailboxes (rotation across them, each contact stays on the mailbox that sent step 1).
- Plain text by default; simple HTML allowed. **No open or click tracking in v1** (better deliverability, no tracking domain needed).
- Every email carries `List-Unsubscribe` (mailto-free, https link to `${PUBLIC_URL}/u/:token`) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, plus an unsubscribe line in the body unless the user removes `{{unsubscribe_link}}` (show a warning if removed).
- States: draft → running → paused → completed. Launch check lists problems in words (no mailboxes, mailbox paused, empty step, contacts all suppressed) and refuses until fixed.
- The campaign runs exactly as the user set it up: no automatic skipping or extra steps.

### 3.5 Sending engine (worker)
- Every minute: find due enrollment steps; for each mailbox, send at most one email at a time, only inside its window, only under today's cap (respecting ramp), only after its random gap since its last send. Caps reset at local midnight of the mailbox timezone.
- Before each send re-check: contact still active, not suppressed, not replied, campaign still running.
- Record each sent email (message-id, mailbox, step, contact, time). Transient SMTP errors (4xx, timeouts) retry with backoff (max 3, then mark failed with reason); 5xx recipient errors mark the contact bounced.
- Structured logs for every decision (`[send] skipped reason=outside_window mailbox=… `) so self-hosters can debug.

### 3.6 Inbox, replies, bounces
- Worker polls each mailbox's INBOX over IMAP every 5 minutes (only new UIDs).
- Reply matching: `In-Reply-To`/`References` against sent message-ids, then fallback sender address + subject. A real reply → contact status `replied`, all their enrollments stop.
- Auto-replies (`Auto-Submitted`, `X-Autoreply`, `X-Autorespond`, "out of office" subjects) are stored and shown labelled **auto-reply**; they do not stop the sequence.
- Bounces (DSN / `mailer-daemon` / `postmaster`, `multipart/report`) → contact bounced + suppressed.
- **Unified inbox** page: all replies across mailboxes, thread view, reply from the UI (sent in-thread from the same mailbox), mark as interested / not interested.

### 3.7 Stats
- Per campaign and per step: sent, replies, reply rate, bounces, unsubscribes, still in sequence. Per mailbox: sent today vs cap, ramp day, health.

### 3.8 REST API + MCP + skills
- REST under `/api/v1` with `Authorization: Bearer <app key>`: contacts (create, bulk create, list, update status), lists, campaigns (create, get, update, add/update/delete step, start, pause, stats), enrollments (enroll contacts/list), replies (list, get thread), mailboxes (list, health). OpenAPI JSON at `/api/v1/openapi.json`.
- MCP at `/mcp` exposing the same actions as tools with clear "what and when" descriptions, plus `draft_reply` (saves a draft). Tool descriptions say: tools never send directly and can never raise a limit; the scheduler sends inside safe limits.
- `skills/`: `write-cold-email-sequence`, `launch-campaign-safely`, `deliverability-checklist`, `triage-replies` — each a SKILL.md that works with this app's MCP.
- Docs page for connecting **Claude, ChatGPT, Cursor, Codex, OpenClaw and Hermes Agent** (any agent that speaks MCP): config snippet per client using the generic custom-MCP setup.

### 3.9 Connect WarmySender (optional, Settings → WarmySender)
User pastes a WarmySender API key (`ws_…`). Base URL `https://warmysender.com/api/v1`, header `Authorization: Bearer <key>`. **Read exact request/response shapes from the live spec `https://warmysender.com/api/v1/openapi.json` — do not guess fields.**
- **Verify list** (contacts page, campaign launch check): `GET /verification/allowance`, `POST /verification/batches`, poll `GET /verification/batches/{id}`, read `GET /verification/batches/{id}/results`; map results to contact status valid/invalid/risky.
- **Warm up this mailbox** (mailbox page, SMTP/IMAP mailboxes only): explain in a confirm dialog that the mailbox login is sent to WarmySender so it can warm the mailbox; then `POST /mailboxes`, `PATCH /warmup/settings/{mailboxId}`, show `GET /warmup/stats/{mailboxId}`. For Microsoft mailboxes show "Connect this mailbox in WarmySender to warm it up" with a link (that sign-in happens inside WarmySender).
- **Find leads**: v1 is a link to WarmySender's leads search plus "import the CSV you export". (There is no public REST leads endpoint today.)
- **No key yet:** each of these buttons opens a small card: what it does, "Connect WarmySender (free trial)" → `https://warmysender.com/?utm_source=github&utm_medium=oss_app&utm_campaign=<feature>`. Never block the core app behind a key.

## 4. README (write in milestone 8, Postiz/OpenSEO style)
Title "WarmySender — open-source cold email". One line: "Open-source cold email you can self-host. The open-source Instantly alternative." Demo GIF (seeded `.test` data), one-command install, features list, "Works with your AI agent" (all six agents + MCP), self-hosting docs links, **"Hosted version: WarmySender — adds warmup, email verification, leads and LinkedIn. New accounts get Pro at $9/month with the sign-up offer → https://warmysender.com"**, star call-to-action, AGPL note, support → https://warmysender.com/support (never an email address).

## 5. Milestones (split into `docs/tasks/01..07`, one PR each)
1. Monorepo skeleton, Docker compose, Postgres, auth (first user admin, invites), API keys, empty UI shell.
2. Mailboxes: SMTP/IMAP + test connection, Microsoft sign-in with own app, encrypted secrets, ramp + caps model.
3. Contacts + CSV import + lists + suppression.
4. Campaign builder (steps, variables, preview, launch check).
5. Sending engine (windows, caps, gaps, ramp, threading, unsubscribe headers, retries, logs) with tests.
6. Inbox polling, reply matching, auto-reply labels, bounces, unified inbox + reply, stats.
7. REST API + OpenAPI + MCP + skills + agent docs.
8. Connect WarmySender (verify, warm up, leads link), seed demo data, README, self-hosting docs, demo GIF.

Each milestone report: what was built, files, how it was tested (commands + output), anything not done and why.

## 6. Acceptance checks (must pass before calling v1 done)
- Clean clone → `docker compose up` → working app, no manual DB steps.
- `pnpm typecheck`, `pnpm test`, `pnpm lint` all green.
- Tests prove: cap never exceeded (incl. ramp), nothing sent outside the window, random gap respected, reply stops the sequence, auto-reply does not, bounce suppresses, unsubscribe link + one-click header present and working, suppressed contacts never sent to.
- A send test against a local SMTP catcher (e.g. Mailpit in a compose profile) shows threading headers on follow-ups.
- `git grep -nE "WS-[0-9]|LL#|GL#|@warmysender\.com"` returns nothing except the public support URL and docs links; no IP addresses; no secrets.

---

## 7. Addendum — what works for the leaders (verified in their repos 2026-11-20) + our improvements

Leaders checked: Postiz (41.9k stars), OpenSEO (28k), Sellbird (6.5k), Warmbly (1.1k). Fold these into the milestones (most land in M7–M8; CI lands as soon as M1 is reviewed).

**Repo files every leader has — add them:**
- `AGENTS.md` + `CLAUDE.md` (how the code is laid out, commands, rules) so people can fork and change it with their own AI agent. README line: "Fork it and have your agent build the tool you want."
- `.env.example` with **every variable documented inline** (Sellbird does this).
- `CHANGELOG.md` + semver tags + GitHub Releases with notes (all four ship releases weekly; every release is a launch).
- `.github/workflows/ci.yml` (install, typecheck, lint, test on every PR and push), `docker-image.yml` (build and publish `ghcr.io/warmysender-oss/warmysender` on each release tag, multi-arch amd64+arm64), `codeql.yml`, `.github/dependabot.yml` (npm + GitHub Actions + Docker, weekly).
- `SUPPORT.md` → https://warmysender.com/support and GitHub Discussions.
- `server.json` for the official MCP registry, `.claude-plugin/` and `.cursor-plugin/` manifests pointing at the skills + MCP (OpenSEO does this), and a working `npx skills add warmysender-oss/warmysender` line in the README.
- `railway.toml` (one-click deploy, Postiz has it) and a compose file that works unchanged on Coolify, Dokploy and Portainer (OpenSEO names these). `docker compose up` must pull the prebuilt GHCR image, not build locally.

**README shape (combine the best of each):**
1. Logo + one line + badges (license, release, CI, stars, Docker pulls).
2. **Hosted version** right under the title (OpenSEO puts it first): "Don't want to run a server? WarmySender hosts it and adds warmup, verification, leads and LinkedIn. New accounts get Pro at $9/month with the sign-up offer."
3. Demo GIF.
4. Features.
5. **Works with your AI agent** — Claude, ChatGPT, Cursor, Codex, OpenClaw, Hermes Agent, any MCP agent; skills install line.
6. **Quick start** with two paths like Sellbird: "Let your agent set it up" (paste-in prompt for Claude Code/Codex/Cursor) and "Or do it yourself" (numbered commands).
7. **Safe by default** section (Sellbird's "Nothing sends without you" equivalent): caps, ramp, windows, stop on reply, unsubscribe, agents can't send directly or raise limits.
8. **Open source vs WarmySender Cloud** table (Postiz has "Cloud vs Open-source"): self-host = cold email sequences, inbox, API, MCP; Cloud adds warmup network, verification, leads database, LinkedIn, Instagram, managed hosting.
9. **Costs** (OpenSEO has this): self-host = your server + your mailboxes; WarmySender features = your WarmySender plan.
10. Self-hosting docs links, Contributing, Community (GitHub Discussions), **Star the repository ⭐** (Warmbly), Security, License.

**Our improvements (things none of them do well):**
- **Built-in deliverability check, no key needed:** on each mailbox page show SPF, DKIM (common selectors), DMARC and MX status for the sending domain with plain-language fixes; block launch with a warning (not a hard block) when SPF or DMARC is missing. Pure DNS lookups only, never connect to anyone's mail server for this.
- **`pnpm doctor` / `docker compose run app doctor`:** checks env vars, database, worker running, `PUBLIC_URL` reachable, each mailbox's SMTP/IMAP login and DNS, and prints a fix for each failure. Self-host support load is what kills OSS projects; this cuts it.
- **First-run guided setup** in the UI: connect mailbox → DNS check → import CSV → first campaign, with the seeded `.test` demo campaign available to explore.
