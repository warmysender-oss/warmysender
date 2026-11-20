# Docker Compose

You need Docker with Compose v2.

## Install

```bash
git clone https://github.com/warmysender-oss/warmysender.git
cd warmysender
```

On a laptop you can skip `.env`. Compose sets `DATABASE_URL`, development `ENCRYPTION_KEY` and `SESSION_SECRET`, `PUBLIC_URL=http://localhost:3000`, and `NODE_ENV=development`. The server prints a warning when it is using those development secrets, and it refuses to start when `NODE_ENV=production` and those values are still set.

For any other deploy, copy the example and fill it in. See [the variable table](README.md).

```bash
cp .env.example .env
```

`ENCRYPTION_KEY` is 32 bytes: `openssl rand -base64 32`, or 64 hex characters. `SESSION_SECRET` is at least 32 characters: `openssl rand -base64 32`. Set `PUBLIC_URL` to the origin browsers open, with no trailing slash. Unsubscribe links are `${PUBLIC_URL}/u/:token`. The Microsoft redirect is `${PUBLIC_URL}/api/oauth/microsoft/callback`.

Start the stack:

```bash
docker compose up
```

`app` and `worker` use `build: .`, so Compose builds the repository `Dockerfile` and starts `postgres` (Postgres 16) beside them. `AGENTS.md` uses `docker compose up --build` when you want that image rebuilt. Open http://localhost:3000 and create the first account. That account is the admin.

Release tags also publish `ghcr.io/warmysender-oss/warmysender` (see [Cutting a release](../RELEASING.md)). The build spec asks for Compose to pull that image. The Compose file in the repository builds the local Dockerfile instead. Changing that file is outside this docs task.

Check the API:

```bash
curl -fsS http://localhost:3000/health
```

That returns `{ "ok": true }`. The build spec also names `docker compose run app doctor`. That script is added with the mailbox milestone. See [Self-hosting](README.md).

Stop the stack with `docker compose down`.

## What comes up

| Service | Role |
| --- | --- |
| `app` | The web UI, the API, and MCP at `/mcp` |
| `worker` | Sending, inbox polling, and bounce handling |
| `postgres` | PostgreSQL 16, including the pg-boss queue |

An optional `mailpit` profile starts a local SMTP catcher for send tests. The UI is http://localhost:8025 and SMTP is `localhost:1025`.

```bash
docker compose --profile mailpit up
```

## Update

Published tags are `1.2.3`, `1.2`, and `1` for a tag `v1.2.3`. A tag with no hyphen also moves `latest`. See [Cutting a release](../RELEASING.md).

`app` and `worker` are built from the repository Dockerfile, so a pull of the Compose file is what changes them:

```bash
git pull
docker compose up --build
```

## From source

The supported install is Compose. A checkout is how you run the test commands and change the code. The runtime is Node 22, pnpm, and PostgreSQL 16.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm dev:server   # API on http://localhost:3000
pnpm dev:web      # UI on http://localhost:5173, proxies /api and /health
pnpm dev:worker
pnpm dev          # API and web UI together
```

`pnpm dev` needs `DATABASE_URL` and the other variables in `.env`. The Compose Postgres service does not publish port 5432. Use a Postgres 16 you can reach from the host. `.env.example` shows `postgres://warmysender:warmysender@localhost:5432/warmysender` for the case where that port is published. The dev-server commands are the same ones in `AGENTS.md`.
