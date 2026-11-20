---
name: deliverability-checklist
description: Check whether a self-hosted WarmySender mailbox is fit to send before a launch. Use when asked about deliverability, DNS, warmup, ramp, or a paused mailbox. Never raises limits.
---

# Deliverability checklist

Use the WarmySender MCP tools. Tools never send directly and can never raise a limit; the scheduler sends inside safe limits.

## When

The user asks if a mailbox is safe to send from, why mail might be landing in spam, or what to fix before launch.

## Steps

1. `list_mailboxes` and `get_mailbox_health` for the mailbox they mean.
2. Report, in plain language:
   - Paused or not, and `paused_reason` when it is set. Three auth failures pause a mailbox; the fix is reconnect, not a higher cap.
   - `sent_today` versus `cap_today`. The default cap is 30 and the hard max is 50. Ramp days 1–7 are 10 a day, days 8–14 are 20, then the mailbox's own cap. Say which day it is when `ramp_day` is set.
   - Health as the tool returns it.
3. DNS is on the mailbox page in the app (SPF, DKIM, DMARC, MX), from DNS lookups only. Tell the user to read that panel. Do not claim a DNS result you were not shown. Missing SPF or DMARC is a warning at launch, not a hard block.
4. Warmup is optional and lives in WarmySender (the hosted product), not in an MCP tool. SMTP mailboxes can be warmed from the mailbox page after the person confirms that the login will be sent to WarmySender. Microsoft mailboxes are connected inside WarmySender. If they have no WarmySender key, the app links them to a free trial and the core app keeps working.
5. Stop. Do not start a campaign from this skill.

## Do not

- Do not raise today's cap, shorten the gap, or widen the sending window. There is no tool for that, and a field that tries is rejected.
