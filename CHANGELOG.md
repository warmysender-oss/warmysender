# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- pnpm monorepo with `apps/server`, `apps/worker`, `apps/web`, and `packages/core`.
- Drizzle schema and the first Postgres migration for the v1 data model.
- Email and password accounts. The first account is an admin. Later people join with an invite link.
- API keys, stored as a SHA-256 hash and shown once.
- AES-256-GCM encryption helper and environment validation.
- pg-boss worker with a heartbeat job.
- Web shell with light and dark mode and sidebar placeholders.
- Dockerfile, Docker Compose (app, worker, Postgres, optional Mailpit), and a documented `.env.example`.
- CI, CodeQL, Dependabot, `AGENTS.md`, `CLAUDE.md`, and `SUPPORT.md`.
