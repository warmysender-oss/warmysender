---
name: launch-campaign-safely
description: Launch a self-hosted WarmySender campaign only after the launch check is clean. Use when the user wants to start, resume, or enroll a campaign. Never sends directly and never raises limits.
---

# Launch a campaign safely

Use the WarmySender MCP tools. Tools never send directly and can never raise a limit; the scheduler sends inside safe limits.

## When

The user wants to enroll people or start a campaign that already has steps.

## Steps

1. `get_campaign` and read every step. Stop if a subject or body is empty, or if `{{unsubscribe_link}}` was removed. Tell the user in words.
2. `get_mailbox_health` for each mailbox on the campaign. If a mailbox is paused, say why and stop. Read `sent_today` and `cap_today`. Do not try to raise the cap. A new mailbox is on a ramp (`ramp_day`); the cap you see is the one that will be used.
3. `list_contacts` or use the list the user named. Suppressed, replied, bounced, unsubscribed, invalid, and risky contacts are not mailed. You do not need to delete them.
4. `enroll` with `contact_ids` or `list_id`.
5. `start_campaign` with only the campaign id. If the result says `started: false`, read `problems` aloud and fix those. Do not retry with extra fields.
6. Tell the user the scheduler will send: inside the mailbox window, under today's cap, after a random gap, one email at a time per mailbox. This skill did not send anything.

## Do not

- Do not invent a tool that sends now, skips the window, or sets `daily_cap`, `min_gap_minutes`, `max_gap_minutes`, `sending_window`, or `ramp`.
- `pause_campaign` is how sends stop. It does not delete the campaign.
