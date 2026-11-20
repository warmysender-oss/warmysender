---
name: triage-replies
description: Read WarmySender replies and save draft responses for a person to send. Use when triaging the inbox, classifying a reply, or writing a response. Drafts are not sent.
---

# Triage replies

Use the WarmySender MCP tools. Tools never send directly and can never raise a limit; the scheduler sends inside safe limits.

## When

The user wants to see who replied, ignore auto-replies, or draft a response.

## Steps

1. `list_replies`. `kind` is `reply`, `auto_reply`, or `bounce`.
2. A `reply` already stopped that contact's sequence. Do not try to stop it again. An `auto_reply` (out of office and other automatic mail) does not stop the sequence. A `bounce` has already suppressed the contact.
3. `get_reply_thread` before writing anything.
4. Draft with `draft_reply` (`id` of the reply, `body` of the draft). Say clearly that this saved a draft and a person sends it from the inbox. Do not tell the user the message was sent.
5. Interested / not interested is a button in the inbox UI. There is no MCP tool for it. Point the user there.
6. If they want a status change on the contact, `update_contact_status` can set `replied`, `unsubscribed`, `invalid`, or `risky`. Do not use it to undo a bounce.

## Do not

- Do not send the reply yourself. `draft_reply` only stores text.
- Do not change sending limits while triaging.
