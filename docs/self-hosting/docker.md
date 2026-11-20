# Docker Compose

You need Docker with Compose v2.

## Install

```bash
git clone https://github.com/warmysender-oss/warmysender.git
cd warmysender
cp .env.example .env
```

Fill in every variable `.env.example` documents. The required names are `DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET`, and `PUBLIC_URL`. Microsoft sign-in also uses `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, and `MS_TENANT` (`common` when unset). See [the variable table](README.md).

Set `PUBLIC_URL` to the origin you will open in a browser. Unsubscribe links are `${PUBLIC_URL}/u/:token`. The Microsoft redirect is `${PUBLIC_URL}/api/oauth/microsoft/callback`.

Start the stack:

```bash
docker compose up
```

Compose pulls `ghcr.io/warmysender-oss/warmysender` for `app` and `worker`, and starts `postgres` beside them. Open http://localhost:3000 and create the first account. That account is the admin.

Check the install:

```bash
docker compose run app doctor
```

Stop it with `docker compose down`.

## What comes up

| Service | Role |
| --- | --- |
| `app` | The web UI, the API, and MCP at `/mcp` |
| `worker` | Sending, inbox polling, and bounce handling |
| `postgres` | PostgreSQL 16, including the pg-boss queue |

An optional `mailpit` profile starts a local SMTP catcher for send tests:

```bash
docker compose --profile mailpit up
```

## Update

Published tags are `1.2.3`, `1.2`, and `1` for a tag `v1.2.3`. A tag with no hyphen also moves `latest`. See [Cutting a release](../RELEASING.md).

```bash
git pull
docker compose pull
docker compose up
```

## From source

The supported install is Compose. A checkout is how you run the test commands and change the code. The runtime is Node 22, pnpm, and PostgreSQL 16.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm doctor
```

The dev-server command is written in `AGENTS.md`.
