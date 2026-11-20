# Self-hosting

WarmySender runs as three processes: `app`, `worker`, and `postgres`. Jobs live in Postgres (pg-boss). There is no Redis service.

The app listens at http://localhost:3000 when you use the repository Compose file on your machine. `PUBLIC_URL` is the origin you put in unsubscribe links and in the Microsoft redirect URL. For a local install that is `http://localhost:3000`. For a public install it is the `https` origin people actually open.

| Path | Use it when |
| --- | --- |
| [Docker Compose](docker.md) | You have Docker on a machine you control |
| [Coolify, Dokploy, Portainer](coolify-dokploy-portainer.md) | You want that same Compose file on one of those panels |
| [Railway](railway.md) | You want the `railway.toml` deploy |

Required environment variables, all documented inline in `.env.example`:

| Variable | Role |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 16 connection string |
| `ENCRYPTION_KEY` | Key for mailbox secrets at rest (AES-256-GCM) |
| `SESSION_SECRET` | Session signing secret |
| `PUBLIC_URL` | Public origin of this install, no trailing path |

Optional, for Microsoft 365 / Outlook sign-in ([MICROSOFT-APP.md](../MICROSOFT-APP.md)):

| Variable | Role |
| --- | --- |
| `MS_CLIENT_ID` | Entra application (client) id |
| `MS_CLIENT_SECRET` | Entra client secret |
| `MS_TENANT` | Directory. `common` when unset |

After the stack is up:

```bash
docker compose run app doctor
```

From a source checkout the same command is `pnpm doctor`. It checks environment variables, the database, that the worker is running, that `PUBLIC_URL` is reachable, and each mailbox's SMTP/IMAP login and DNS, and it prints a fix for each failure.

The first account created in the UI is the admin.
