# Task 08 — One writer for app, REST API and MCP (after 03 and 07 merged — both are on main)

Problem: `apps/server/src/api/db-services.ts` (Task 07) implements contacts, lists and campaigns on its own, while Task 03 built `apps/server/src/contacts/**`, `apps/server/src/campaigns/**` and `packages/core/src/campaigns/**` for the app. Two writers drift apart (different launch checks, dedupe, suppression, templating, enrollment rules).

Lane: `apps/server/src/api/**`, `apps/server/src/mcp/**`, and the minimum exports needed from `apps/server/src/contacts/**`, `apps/server/src/campaigns/**`, `packages/core/src/campaigns/**`.

Do:
1. Make every REST `/api/v1` and MCP action for contacts, lists, suppression, campaigns, steps, enrollments, start and pause call the SAME service functions the app routes use. Delete the duplicated logic from `api/db-services.ts`.
2. Keep the API's guarantees: limit fields stay locked (`limit_locked`), no send tool, `draft_reply` only saves a draft, scopes/auth unchanged, OpenAPI document updated if shapes change.
3. Tests that prove parity: the same input through the app route and through REST/MCP gives the same stored rows and the same launch-check messages (CSV/bulk dedupe, suppressed contact skipped, launch refused with a paused mailbox, start creates enrollments only for active non-suppressed contacts).
4. Do not touch `apps/worker/**` or `packages/core/src/scheduler/**` (Task 05 is finishing there).
