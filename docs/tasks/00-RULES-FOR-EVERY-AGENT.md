# Rules for every agent (read before any task)

1. Read `docs/BUILD-SPEC.md` in full — section 1 (Hard rules), section 6 (Acceptance checks) and section 7 (Addendum) bind every task.
2. **Start from the latest `main`.** Rebase on `main` right before opening your PR. Never reuse a migration number that already exists on `main`.
3. Work on your own branch, open a PR to `main`. Never push to `main`, never force-push `main`, never rewrite history.
4. **Stay in your lane:** only touch the folders your task file lists. If you need a change elsewhere (e.g. a schema column), make the smallest change, call it out at the top of the PR description.
5. The database schema lives in `packages/core/src/db/schema.ts` (created by task 01). Add columns with a new migration; never edit an old migration.
6. Before opening the PR: `pnpm typecheck && pnpm lint && pnpm test` green; paste the real output into the PR description.
7. No guesses: read https://warmysender.com/api/v1/openapi.json for WarmySender shapes; never call it with a real key (mock it in tests).
8. Write fresh code; nothing from any private WarmySender repo. `.test` domains only in demo data. No secrets, no IPs, no ticket ids.
9. PR description: what was built, files, test output, what is not done and why, open questions.
