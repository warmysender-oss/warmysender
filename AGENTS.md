# Agents

WarmySender is an open-source, self-hosted cold email app. Fork it and change it with your own agent. This file is the map.

## Layout

- `apps/server` — Express API. Health at `/health`. Auth, invites, and API keys live here. In production it also serves `apps/web/dist`.
- `apps/worker` — pg-boss jobs. Postgres is the queue (no Redis). The foundation job is `heartbeat`, every minute, written to `audit_log`.
- `apps/web` — React + Vite + Tailwind + shadcn-style UI. Sidebar: Dashboard, Mailboxes, Contacts, Campaigns, Inbox, Settings.
- `packages/core` — Drizzle schema, migrations, env loader, AES-256-GCM, password and API-key hashing.
- `packages/core/src/db/schema.ts` — the v1 schema. Add a column with a new migration. Never edit a migration that already shipped.
- `skills/` — agent skills. Empty until the MCP milestone.
- `docs/` — the build spec and task files.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm dev:server   # API on http://localhost:3000
pnpm dev:web      # UI on http://localhost:5173, proxies /api and /health
pnpm dev:worker
pnpm db:generate  # new Drizzle migration from the schema
docker compose up --build
```

`pnpm dev` runs the API and the web UI together. One dev server pair at a time.

## Rules that are code, not suggestions

- Fresh code only. No material from the private WarmySender product. No ticket ids, customer addresses, or server IPs. Demo data uses `.test` domains.
- No secrets in git. `.env.example` has empty values. Do not log keys, passwords, or tokens.
- Mailbox daily cap defaults to 30 and the database rejects anything outside 1–50. Later tasks must not add a way for an agent to raise that.
- Agents do not send mail. Campaign tools create and start campaigns. The scheduler sends. Reply tools save a draft a human sends.
- The first account is the admin. Everyone after that needs an invite link. Invite tokens and API keys are stored as SHA-256 hashes and shown once.
- Secrets at rest use AES-256-GCM with `ENCRYPTION_KEY` (32 bytes, base64 or 64 hex chars).
- `NODE_ENV=production` refuses the development key and session secret published in `docker-compose.yml`.

## Auth and API

- `POST /api/auth/register` `{ email, password, name?, inviteToken? }`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/setup`
- `POST /api/invites` (admin) returns `{ token, url }` once. `GET /api/invites`, `DELETE /api/invites/:id`
- `POST /api/api-keys` returns `{ key }` once. `GET /api/api-keys` does not. `DELETE /api/api-keys/:id` revokes.
- Session cookie: `ws_session` (httpOnly, SameSite=Lax).

## Tests

Vitest. Auth tests migrate the SQL onto PGlite (Postgres compiled to WASM) so `pnpm test` does not need Docker. The migration SQL is the same file Docker applies to Postgres 16.
