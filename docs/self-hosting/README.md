# Self-hosting

WarmySender runs as three processes: `app`, `worker`, and `postgres`. Jobs live in Postgres (pg-boss). There is no Redis service.

The app listens at http://localhost:3000 when you use the repository Compose file on your machine. `PUBLIC_URL` is the origin you put in unsubscribe links and in the Microsoft redirect URL. For a local install that is `http://localhost:3000`. For a public install it is the `https` origin people actually open.

| Path | Use it when |
| --- | --- |
| [Docker Compose](docker.md) | You have Docker on a machine you control |
| [Coolify, Dokploy, Portainer](coolify-dokploy-portainer.md) | You want that same Compose file on one of those panels |
| [Railway](railway.md) | You want the `railway.toml` deploy |

`.env.example` documents every variable inline. `docker compose up` on a laptop runs without that file: Compose fills development defaults, and the server refuses those defaults when `NODE_ENV=production`.

| Variable | Role |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 16 connection string. Compose sets `postgres://warmysender:warmysender@postgres:5432/warmysender` for the `app` and `worker` services. |
| `ENCRYPTION_KEY` | 32-byte AES-256-GCM key, base64 (`openssl rand -base64 32`) or 64 hex characters. Encrypts mailbox secrets at rest. |
| `SESSION_SECRET` | At least 32 characters (`openssl rand -base64 32`). Session cookie signing. Separate from the encryption key. |
| `PUBLIC_URL` | Public origin of this install, no trailing slash. Compose default `http://localhost:3000`. `pnpm dev` serves the UI at `http://localhost:5173`. |
| `PORT` | API port. Default `3000`. The server reads this value. |
| `HOST` | Bind address. Default `0.0.0.0`. |

Optional, for Microsoft 365 / Outlook sign-in ([MICROSOFT-APP.md](../MICROSOFT-APP.md)). Set both client values, or leave both empty.

| Variable | Role |
| --- | --- |
| `MS_CLIENT_ID` | Entra application (client) id |
| `MS_CLIENT_SECRET` | Entra client secret |
| `MS_TENANT` | `common` (default), `organizations`, `consumers`, or a tenant id |

The build spec's install check is:

```bash
docker compose run app doctor
pnpm doctor
```

That command checks environment variables, the database, that the worker is running, that `PUBLIC_URL` is reachable, and each mailbox's SMTP/IMAP login and DNS, and it prints a fix for each failure. The foundation `package.json` scripts are `dev`, `dev:server`, `dev:web`, `dev:worker`, `build`, `typecheck`, `lint`, `test`, and `db:generate`. A `doctor` script is not among them. The mailbox task adds it.

Until then, the API health URL is http://localhost:3000/health (`GET` returns `{ "ok": true }`). The same handler is on `/api/health`.

The first account created in the UI is the admin.
