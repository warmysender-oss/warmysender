import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationsFolder } from "./migrate.js";

const TABLES = [
  "users",
  "invites",
  "sessions",
  "api_keys",
  "settings",
  "mailboxes",
  "contacts",
  "lists",
  "list_members",
  "suppressions",
  "campaigns",
  "campaign_steps",
  "campaign_mailboxes",
  "enrollments",
  "messages",
  "inbound_messages",
  "reply_drafts",
  "unsubscribe_tokens",
  "audit_log",
];

describe("first migration", () => {
  it("creates every v1 table and the scheduler indexes", () => {
    const folder = migrationsFolder();
    const files = readdirSync(folder).filter((name) => name.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    const sqlText = files.map((name) => readFileSync(join(folder, name), "utf8")).join("\n").toLowerCase();
    for (const table of TABLES) {
      expect(sqlText).toContain(`create table "${table}"`);
    }
    expect(sqlText).toContain("enrollments_due_idx");
    expect(sqlText).toContain("messages_mailbox_sent_idx");
    expect(sqlText).toContain("warmysender_api_key_encrypted");
    expect(sqlText).toContain("oauth_refresh_token_encrypted");
    expect(sqlText).toContain("daily_cap");
    expect(sqlText).toContain("ramp_started_on");
  });
});
