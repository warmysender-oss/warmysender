# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-20

First public release: open-source cold email you can self-host, by WarmySender.

### Added

- **Mailboxes:** any SMTP/IMAP host (Gmail and Google Workspace app passwords, Zoho, Hostinger, Fastmail, custom) and Microsoft 365 / Outlook through your own Entra app. Test connection with plain-language errors.
- **Safe sending built into the code:** daily cap per mailbox (default 30, hard maximum 50), a ramp for new mailboxes (10 a day in week one, 20 in week two), sending days and hours per time zone, a random gap between sends, one send at a time per mailbox, and a pause after three sign-in failures in a row.
- **Deliverability check:** SPF, DKIM, DMARC and MX for each sending domain, with the fix for each problem.
- **Contacts:** CSV import with column mapping and duplicate detection, lists, and a suppression list for addresses and whole domains.
- **Sequences:** multi-step campaigns with delays, `{{variables}}` with fallbacks, follow-ups in the same thread, a preview with a real contact, and a launch check that explains problems in words.
- **Unsubscribe:** one-click `List-Unsubscribe` on every email; unsubscribes and bounces are suppressed automatically.
- **Inbox:** replies from every mailbox in one place. A real reply stops the sequence; auto-replies are labelled and do not. Reply from the thread.
- **Stats:** sent, replies, reply rate, bounces and unsubscribes per campaign, step and mailbox.
- **AI agents:** REST API and an MCP server for Claude, ChatGPT, Cursor, Codex, OpenClaw and Hermes Agent, plus agent skills. Agents can build and start campaigns but can never send directly or raise a limit.
- **WarmySender connect (optional):** email verification and mailbox warmup through a WarmySender API key.
- **Self-hosting:** `docker compose up`, a `doctor` command that checks your setup, docs for Docker, Coolify, Dokploy, Portainer and Railway.

