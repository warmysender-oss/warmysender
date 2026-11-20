import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { connectUrl, LEADS_SEARCH_URL, MICROSOFT_MAILBOX_URL } from "./warmysender/links.js";
import { assertDemoDomains, seedDemo } from "./seed/demo-data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("server.json matches the MCP registry schema constraints we depend on", () => {
  const document = JSON.parse(readFileSync(join(root, "server.json"), "utf8")) as {
    name: string;
    description: string;
    version: string;
    remotes: { type: string; url: string; headers: { name: string; isSecret: boolean }[] }[];
  };
  assert.match(document.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  assert.ok(document.description.length >= 1 && document.description.length <= 100);
  assert.match(document.version, /^\d+\.\d+\.\d+$/);
  assert.ok(document.remotes.length >= 1);
  for (const remote of document.remotes) {
    assert.equal(remote.type, "streamable-http");
    assert.match(remote.url, /^https?:\/\/\S+$/);
    assert.ok(remote.url.includes("/mcp"));
    assert.equal(remote.headers[0]?.name, "Authorization");
    assert.equal(remote.headers[0]?.isSecret, true);
  }
});

test("skills install as npx skills add expects, and plugins point at them", () => {
  const skillsDir = join(root, "skills");
  const names = readdirSync(skillsDir);
  assert.deepEqual(names.sort(), [
    "deliverability-checklist",
    "launch-campaign-safely",
    "triage-replies",
    "write-cold-email-sequence",
  ]);
  for (const name of names) {
    const text = readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
    assert.match(text, new RegExp(`^---\\nname: ${name}\\n`));
    assert.match(text, /description: .+/);
    assert.match(text, /Tools never send directly and can never raise a limit/);
  }
  const claude = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8")) as {
    userConfig: Record<string, unknown>;
    mcpServers: { warmysender: { url: string; headers: { Authorization: string } } };
  };
  assert.match(claude.mcpServers.warmysender.url, /\$\{user_config\.base_url\}/);
  assert.match(claude.mcpServers.warmysender.headers.Authorization, /\$\{user_config\.api_key\}/);
  assert.ok(claude.userConfig.base_url);
  assert.ok(claude.userConfig.api_key);
  const cursor = JSON.parse(readFileSync(join(root, ".cursor-plugin/plugin.json"), "utf8")) as { skills: string; mcpServers: string };
  assert.equal(cursor.skills, "skills");
  const cursorMcp = JSON.parse(readFileSync(join(root, cursor.mcpServers), "utf8")) as { mcpServers: { warmysender: { url: string } } };
  assert.match(cursorMcp.mcpServers.warmysender.url, /\/mcp$/);
  const marketplace = JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8")) as {
    plugins: { skills: string[] }[];
  };
  assert.equal(marketplace.plugins[0]?.skills?.length, 4);
});

test("public WarmySender links and demo data stay on documented URLs and .test domains", async () => {
  assert.equal(connectUrl("verify"), "https://warmysender.com/?utm_source=github&utm_medium=oss_app&utm_campaign=verify");
  assert.equal(connectUrl("warmup"), "https://warmysender.com/?utm_source=github&utm_medium=oss_app&utm_campaign=warmup");
  assert.equal(connectUrl("leads"), "https://warmysender.com/?utm_source=github&utm_medium=oss_app&utm_campaign=leads");
  const webLinks = readFileSync(join(root, "apps/web/src/pages/settings/warmysender-links.ts"), "utf8");
  assert.ok(webLinks.includes(LEADS_SEARCH_URL));
  assert.ok(webLinks.includes(MICROSOFT_MAILBOX_URL));
  assert.ok(webLinks.includes('searchParams.set("utm_source", "github")'));
  assert.ok(webLinks.includes('searchParams.set("utm_medium", "oss_app")'));
  assert.ok(webLinks.includes('searchParams.set("utm_campaign", feature)'));
  assertDemoDomains();
  const inserted: string[] = [];
  const first = await seedDemo({
    hasDemo: async () => false,
    insertMailbox: async () => {
      inserted.push("mailbox");
      return "box";
    },
    insertContacts: async () => {
      inserted.push("contacts");
      return ["c1", "c2", "c3"];
    },
    insertList: async () => {
      inserted.push("list");
      return "list";
    },
    insertCampaign: async () => {
      inserted.push("campaign");
      return "campaign";
    },
  });
  assert.equal(first.inserted, true);
  assert.deepEqual(inserted, ["mailbox", "contacts", "list", "campaign"]);
  const second = await seedDemo({
    hasDemo: async () => true,
    insertMailbox: async () => {
      throw new Error("should not insert");
    },
    insertContacts: async () => [],
    insertList: async () => "",
    insertCampaign: async () => "",
  });
  assert.equal(second.inserted, false);
});
