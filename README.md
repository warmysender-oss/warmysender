<p align="center">
  <img src="assets/logo.svg" alt="WarmySender" width="72" />
</p>

# WarmySender — open-source cold email

Open-source cold email you can self-host. The open-source Instantly alternative.

Don't want to run a server? WarmySender hosts it and adds warmup, verification, leads and LinkedIn. New accounts get Pro at $9/month with the sign-up offer.

**Hosted version: WarmySender — adds warmup, email verification, leads and LinkedIn. New accounts get Pro at $9/month with the sign-up offer → https://warmysender.com**

[![License: AGPL-3.0](https://img.shields.io/github/license/warmysender-oss/warmysender)](LICENSE)
[![Release](https://img.shields.io/github/v/release/warmysender-oss/warmysender)](https://github.com/warmysender-oss/warmysender/releases)
[![CI](https://github.com/warmysender-oss/warmysender/actions/workflows/ci.yml/badge.svg)](https://github.com/warmysender-oss/warmysender/actions/workflows/ci.yml)
[![Stars](https://img.shields.io/github/stars/warmysender-oss/warmysender)](https://github.com/warmysender-oss/warmysender/stargazers)
[![Docker image](https://img.shields.io/badge/ghcr.io-warmysender--oss%2Fwarmysender-2496ED?logo=docker&logoColor=white)](https://github.com/warmysender-oss/warmysender/pkgs/container/warmysender)

## Demo

<!-- DEMO GIF -->

Seeded demo data uses `.test` domains only.

## Features

- `docker compose up` runs the app, the worker, and PostgreSQL. Jobs stay in Postgres through pg-boss.
- Email and password accounts. The first visitor is the admin and invites teammates by link.
- API keys (create, name, revoke). A key is shown once and stored hashed.
- Any SMTP/IMAP mailbox, with presets for Gmail / Google Workspace (App Password), Zoho, Hostinger, Fastmail, and custom hosts, plus Microsoft 365 / Outlook through the self-hoster's own Entra app.
- Per-mailbox daily cap, sending window, random gap, and a ramp for new mailboxes.
- CSV import, lists, and a global suppression list.
- Sequences with variables and fallbacks, same-thread follow-ups, and a launch check that lists problems in words.
- v1 sends the message as you wrote it, with `List-Unsubscribe` and one-click unsubscribe, and without open or click tracking.
- A unified inbox. A real reply stops the sequence. Auto-replies are labeled and do not stop it. Bounces are suppressed.
- Stats per campaign, step, and mailbox.
- REST API (`/api/v1`) and MCP (`/mcp`) for Claude, ChatGPT, Cursor, Codex, OpenClaw, Hermes Agent, and any other MCP client.
- Optional WarmySender connect for list verification, mailbox warmup, and a leads-search link. The core app runs with no WarmySender key.
- A DNS deliverability check (SPF, DKIM, DMARC, MX) on each mailbox, and `pnpm doctor` / `docker compose run app doctor`.

## Works with your AI agent

Claude, ChatGPT, Cursor, Codex, OpenClaw, Hermes Agent, and any client that speaks MCP. Connection snippets for all six are in [docs/agents.md](docs/agents.md).

```bash
npx skills add warmysender-oss/warmysender
```

Fork it and have your agent build the tool you want. Layout and commands for that agent live in [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md).

## Quick start

### Let your agent set it up

Paste this into Claude Code, Codex, or Cursor:

```text
Set up open-source WarmySender from https://github.com/warmysender-oss/warmysender in this folder.

1. Clone the repository if it is not already here.
2. Copy .env.example to .env and fill every variable that file documents. Do not commit .env. Demo and test addresses use .test domains only.
3. Start the stack with `docker compose up`. That pulls ghcr.io/warmysender-oss/warmysender.
4. Open http://localhost:3000. The first account becomes the admin.
5. Run `docker compose run app doctor` and apply each fix it prints.
6. Leave the sending caps, window, gap, and ramp as they are. Agents create and start campaigns. The scheduler sends. An agent cannot raise a limit, and a reply draft stays a draft until a person sends it from the inbox.
```

### Or do it yourself

1. Clone the repository and move into it.

   ```bash
   git clone https://github.com/warmysender-oss/warmysender.git
   cd warmysender
   ```

2. Create `.env` from the example and fill in the values it documents (`DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET`, `PUBLIC_URL`, and the optional `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT`).

   ```bash
   cp .env.example .env
   ```

3. Start the stack. Compose pulls `ghcr.io/warmysender-oss/warmysender`.

   ```bash
   docker compose up
   ```

4. Open http://localhost:3000 and create the first account. That account is the admin.
5. Check the install.

   ```bash
   docker compose run app doctor
   ```

The same checks from a source checkout are `pnpm doctor`. Details, including Coolify, Dokploy, Portainer, and Railway, are in [docs/self-hosting/README.md](docs/self-hosting/README.md).

## Safe by default

Limits are code. An agent cannot raise them.

- Each mailbox sends at most its daily cap. The default is 30. The hard maximum is 50.
- A new mailbox ramps: 10 a day on days 1–7, 20 a day on days 8–14, then that mailbox's own cap.
- Sends happen only inside the mailbox's sending window and timezone, and only after a random gap since its last send (default 4–9 minutes). One email at a time per mailbox.
- A real reply stops that contact's sequences. A bounce suppresses the contact. Suppressed contacts are skipped.
- Every email can be unsubscribed in one click (`List-Unsubscribe` and `List-Unsubscribe-Post`).
- MCP and API tools create and start campaigns. The scheduler sends. Reply drafting saves a draft a person sends from the inbox.

## Open source vs WarmySender Cloud

The build spec assigns the rows below. A blank cell means that line does not assign the row to that column.

| | Open source (self-host) | WarmySender Cloud |
| --- | --- | --- |
| Cold email sequences | Yes | |
| Inbox | Yes | |
| API | Yes | |
| MCP | Yes | |
| Warmup network | | Yes |
| Email verification | | Yes |
| Leads database | | Yes |
| LinkedIn | | Yes |
| Instagram | | Yes |
| Managed hosting | | Yes |

Hosted version: WarmySender — adds warmup, email verification, leads and LinkedIn. New accounts get Pro at $9/month with the sign-up offer → https://warmysender.com

## Costs

Self-hosting costs your server and your mailboxes. WarmySender features (warmup, verification, leads, LinkedIn) cost your WarmySender plan. New accounts get Pro at $9/month with the sign-up offer → https://warmysender.com

## Self-hosting

- [Docker Compose](docs/self-hosting/docker.md)
- [Coolify, Dokploy, and Portainer](docs/self-hosting/coolify-dokploy-portainer.md)
- [Railway](docs/self-hosting/railway.md)
- [Microsoft 365 / Outlook app](docs/MICROSOFT-APP.md)
- [Connect an agent](docs/agents.md)
- [Cutting a release](docs/RELEASING.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Checks for this repo:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Community

Questions and ideas go to [GitHub Discussions](https://github.com/warmysender-oss/warmysender/discussions).

## Star the repository ⭐

If this is useful, star [warmysender-oss/warmysender](https://github.com/warmysender-oss/warmysender/stargazers).

## Security

Report vulnerabilities through https://warmysender.com/support (see [SECURITY.md](SECURITY.md)). Do not open a public issue for a security problem.

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a network service, the AGPL requires you to offer the corresponding source to users of that service.

Support for the project and the hosted product: https://warmysender.com/support
