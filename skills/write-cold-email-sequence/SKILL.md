---
name: write-cold-email-sequence
description: Write a short cold-email sequence and save it as a draft campaign in self-hosted WarmySender. Use when asked for a sequence, follow-ups, or first-touch copy. Never sends and never changes sending limits.
---

# Write a cold email sequence

Use the WarmySender MCP tools. Tools never send directly and can never raise a limit; the scheduler sends inside safe limits.

## When

The user wants a 2–4 step cold email sequence for this self-hosted app.

## Steps

1. Read the offer in the user's words. If the audience or the ask is missing, ask before writing.
2. `create_campaign` with a plain name. Leave it as a draft. Do not call `start_campaign` in this skill.
3. Add steps with `add_campaign_step`:
   - Step 1: `delay_days` 0.
   - Later steps: a delay in whole days after the previous step. Follow-ups stay in the same thread. Repeat the first subject prefixed with `Re:` unless the user wants a new subject.
   - Plain text. Short. One ask.
   - Variables: `{{first_name}}`, `{{company}}`, `{{title}}`, and any custom field. Always give a fallback: `{{first_name|there}}`.
   - Keep `{{unsubscribe_link}}` in every body. If the user tells you to remove it, leave it in and say the app warns when it is missing.
4. Show the steps back to the user. Do not enroll anyone and do not start the campaign unless they ask, and even then switch to the `launch-campaign-safely` skill.

## Do not

- Do not call any send tool. There isn't one. `start_campaign` only flips state after its launch check; the scheduler sends.
- Do not pass a daily cap, gap, window, or ramp. Those calls are rejected.
