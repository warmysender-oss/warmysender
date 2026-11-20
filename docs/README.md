# Documentation

Index of the documents in this repository. The product overview and the short FAQ are in the [README](../README.md). A copy written for assistants is [`llms.txt`](../llms.txt) at the repository root.

## Use and operate

- [FAQ](faq.md) — the same questions as the README FAQ, with the longer answers.
- [Self-hosting](self-hosting/README.md) — the three processes (`app`, `worker`, `postgres`), environment variables, and which path to follow.
- [Docker Compose](self-hosting/docker.md) — `docker compose up`, Postgres 16, and running the checkout with Node 22 and pnpm.
- [Coolify, Dokploy, and Portainer](self-hosting/coolify-dokploy-portainer.md) — the same Compose file on those panels.
- [Railway](self-hosting/railway.md) — the root `railway.toml` builds the root `Dockerfile`.
- [Microsoft 365 / Outlook](MICROSOFT-APP.md) — the Entra app registration for a self-hosted server. Refresh tokens stay on that server.
- [Connect an agent](agents.md) — MCP at `/mcp` for Claude, ChatGPT, Cursor, Codex, OpenClaw, and Hermes Agent.
- [Cutting a release](RELEASING.md) — tags, the GitHub Release, and the `ghcr.io/warmysender-oss/warmysender` image.
- [Build spec](BUILD-SPEC.md) — what v1 is, the hard rules, and the acceptance checks.

## Task files

These are the build tasks for this repository.

- [Rules for every agent](tasks/00-RULES-FOR-EVERY-AGENT.md)
- [Task 01 — Foundation](tasks/01-foundation.md)
- [Task 02 — Mailboxes, deliverability, doctor](tasks/02-mailboxes-deliverability.md)
- [Task 03 — Contacts and campaigns](tasks/03-contacts-campaigns.md)
- [Task 04 — README, docs, release](tasks/04-readme-docs-release.md)
- [Task 05 — Sending engine](tasks/05-sending-engine.md)
- [Task 06 — Inbox, replies, stats](tasks/06-inbox-replies-stats.md)
- [Task 07 — REST API, MCP, WarmySender connect](tasks/07-api-mcp-warmysender.md)
- [Task 08 — One writer](tasks/08-one-writer.md)
- [Task 09 — Search and AI-assistant optimisation](tasks/09-seo-geo.md)
