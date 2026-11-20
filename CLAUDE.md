# Claude

Read [AGENTS.md](AGENTS.md) before changing this repo. It has the layout, commands, and the rules that later tasks must not break.

Short version:

- Schema: `packages/core/src/db/schema.ts`. New migration for every column. Do not edit an old migration.
- Check your work with `pnpm typecheck && pnpm lint && pnpm test`.
- No secrets in git. Demo emails end in `.test`. Do not copy code from the private WarmySender product.
- Safety limits (daily cap max 50, windows, gaps, ramp, stop on reply) are enforced in code. An agent cannot raise them, and no tool sends a message directly.
- Work on a branch and open a pull request. Do not push to `main`.
