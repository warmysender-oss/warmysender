# FAQ

The same questions as the [README FAQ](../README.md#faq). Answers here are the longer version. Every limit below is enforced in code in this repository.

## Is there a free open-source alternative to Instantly?

Yes. This repository is open-source cold email you self-host, licensed under the GNU AGPL-3.0, with no licence fee. Instantly is a closed-source hosted service. On your own server the app covers sequences, a unified inbox, a REST API at `/api/v1`, and an MCP server at `/mcp`. Warmup, email verification, leads, and LinkedIn are WarmySender Cloud features. The hosted line on the README states the current sign-up offer.

## Can I self-host cold email software?

Yes. WarmySender is self-hosted cold email. `docker compose up` starts three processes: the app (UI, API, and MCP), the worker (sending, inbox polling, and bounce handling), and PostgreSQL 16. Jobs stay in Postgres through pg-boss. There is no Redis service. Open http://localhost:3000 and create the first account. That account is the admin. Paths for Docker, Coolify, Dokploy, Portainer, and Railway are in [self-hosting](self-hosting/README.md).

## What do I need to run it?

Docker with Compose v2 is the supported install, and a laptop can start it without a `.env` file because Compose fills development defaults. A checkout of the source uses Node 22, pnpm, and a PostgreSQL 16 you can reach from the host. You also bring your own mailboxes. Before a public install, copy `.env.example` to `.env` and set `ENCRYPTION_KEY` (32 bytes, base64 or 64 hex characters) and `SESSION_SECRET` (at least 32 characters). `NODE_ENV=production` refuses the development key and session secret published in `docker-compose.yml`. `pnpm doctor` checks the environment, the database, that the worker is running, that `PUBLIC_URL` is reachable, and each mailbox's login and DNS.

## Does it work with Gmail and Outlook?

Yes. Any SMTP and IMAP host works. Presets cover Gmail and Google Workspace with an app password, Zoho, Hostinger, Fastmail, and a custom host. Microsoft 365 and Outlook sign in through an Entra app you register yourself. WarmySender does not ship a Microsoft app. Refresh tokens from that sign-in stay on your server, encrypted at rest. The redirect URL, scopes, and registration steps are in [MICROSOFT-APP.md](MICROSOFT-APP.md).

## How does it keep my mailboxes safe?

The limits are code, and an agent cannot raise them. Each mailbox sends at most its daily cap. The default is 30 and the database rejects a cap outside 1–50. A new mailbox ramps: 10 a day on days 1–7, 20 a day on days 8–14, then that mailbox's own cap. Sends happen only inside the mailbox's sending window and time zone, only one at a time, and only after a random gap since its last send (default 4–9 minutes). A real reply stops that contact's sequences. An auto-reply is labeled and does not stop the sequence. A bounce suppresses the contact, and suppressed contacts are skipped. Three sign-in failures in a row pause the mailbox. Every email includes `List-Unsubscribe` and one-click unsubscribe. v1 sends the message as you wrote it, without open or click tracking.

## Can AI agents like Claude or ChatGPT run my campaigns?

Yes. Claude, ChatGPT, Cursor, Codex, OpenClaw, and Hermes Agent connect to `/mcp` with an API key (`Authorization: Bearer`), and the same actions are on the REST API. Tools create and start campaigns. The scheduler sends, inside the caps, window, gap, and ramp. A tool cannot raise a limit and cannot send a message itself. `draft_reply` saves a draft a person sends from the inbox. Install the skills with `npx skills add warmysender-oss/warmysender`. Connection snippets for all six agents are in [agents.md](agents.md).

## Does it do email warmup?

Warmup is a WarmySender Cloud feature you can connect with a key. This app does not run a warmup network. Sequences, the inbox, the scheduler, and the DNS check (SPF, DKIM, DMARC, MX) work with no WarmySender key. In Settings → WarmySender, warming an SMTP or IMAP mailbox asks you to confirm first. The confirmation states that the mailbox login is sent to WarmySender so it can warm the mailbox, and that WarmySender stores that login on your WarmySender account. A Microsoft mailbox shows "Connect this mailbox in WarmySender to warm it up" because that sign-in happens inside WarmySender.

## Is it really free?

The software is free to run. There is no licence fee for this repository. Self-hosting costs your server and your mailboxes. Warmup, email verification, leads, and LinkedIn use a WarmySender plan. New accounts get Pro at $9/month with the sign-up offer at https://warmysender.com. The core app runs with no WarmySender key.

## What licence is it?

GNU Affero General Public License v3.0 ([LICENSE](../LICENSE)). You can run, study, and change the code. If you run a modified version as a network service, the AGPL requires you to offer the corresponding source to users of that service.

## How is it different from Instantly, lemlist or Smartlead?

You self-host this program, the source is AGPL-3.0, and accounts, contacts, and messages stay in the Postgres database you run. Instantly, lemlist, and Smartlead are closed-source hosted services. Someone looking for a lemlist alternative or a Smartlead alternative gets the same arrangement as the Instantly alternative named in the README: your server, your mailboxes, and MCP for Claude, ChatGPT, Cursor, Codex, OpenClaw, and Hermes Agent, with the safety limits above. This page does not compare their features or prices. The table in the README records only "Closed source" or "Hosted only" in their column.
