# WarmySender — open-source cold email

Open-source cold email you can self-host. The open-source Instantly alternative, by WarmySender.

Hosted WarmySender adds warmup, email verification, leads and LinkedIn → https://warmysender.com

> **Under construction.** Accounts and the app shell run. Mailboxes, campaigns, and sending are not built yet.

## Development

```bash
pnpm install
cp .env.example .env   # fill DATABASE_URL, ENCRYPTION_KEY, SESSION_SECRET, PUBLIC_URL
pnpm dev:server        # API on http://localhost:3000
pnpm dev:web           # UI on http://localhost:5173
```

Or start the API and the UI together with `pnpm dev`. The worker is `pnpm dev:worker`.

Docker, from a clean clone:

```bash
docker compose up --build
```

That uses development-only secrets so the stack boots. Do not use those secrets on a public server. `NODE_ENV=production` refuses them. Every variable is documented in [.env.example](.env.example).

Fork it and have your agent build the tool you want. Start with [AGENTS.md](AGENTS.md).

## Self-host or hosted

- **Self-host:** bring your own server, mailboxes and API keys. Free and open source under the [AGPL-3.0](LICENSE).
- **Hosted version:** don't want to run it yourself? Use [WarmySender](https://warmysender.com) — hosted, with warmup, email verification, leads and LinkedIn outreach.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read our [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Security

Please don't open public issues for security problems. See [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE)
