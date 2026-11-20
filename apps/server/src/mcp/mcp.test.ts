import assert from "node:assert/strict";
import test from "node:test";
import { SAFETY_SENTENCE } from "../api/limits.js";
import { createMemoryServices } from "../api/memory.js";
import { handleMcpMessage } from "./jsonrpc.js";
import { MCP_TOOLS } from "./tools.js";

test("every tool says it never sends and never raises a limit", () => {
  const names = MCP_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("draft_reply"));
  assert.ok(names.includes("start_campaign"));
  for (const name of names) assert.equal(name.includes("send"), false);
  for (const tool of MCP_TOOLS) {
    assert.ok(tool.description.includes(SAFETY_SENTENCE), tool.name);
    assert.match(tool.description, /^What: .+ When: /);
    assert.equal(JSON.stringify(tool.inputSchema).includes("daily_cap"), false);
  }
});

test("tools/list and tools/call stay inside the scheduler", async () => {
  const memory = createMemoryServices();
  const listed = await handleMcpMessage(memory.services, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  const tools = (listed?.result as { tools: { name: string }[] }).tools;
  assert.equal(tools.length, MCP_TOOLS.length);

  const unknown = await handleMcpMessage(memory.services, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "send_email", arguments: {} },
  });
  assert.equal((unknown?.error as { code: number }).code, -32602);

  const limited = await handleMcpMessage(memory.services, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "update_contact_status", arguments: { id: "contact-1", status: "active", dailyCap: 80 } },
  });
  const limitedResult = limited?.result as { isError: boolean; content: { text: string }[] };
  assert.equal(limitedResult.isError, true);
  assert.match(limitedResult.content[0].text, /limit_locked/);

  const campaign = await memory.services.campaigns.create({ name: "Harbor intro" });
  await memory.services.campaigns.addStep(campaign.id, { subject: "Hi", body: "Hello", delay_days: 0 });
  await memory.services.campaigns.update(campaign.id, { mailbox_ids: ["box-1"] });
  const started = await handleMcpMessage(memory.services, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "start_campaign", arguments: { id: campaign.id } },
  });
  const startedResult = started?.result as { isError: boolean; content: { text: string }[] };
  assert.equal(startedResult.isError, false);
  assert.match(startedResult.content[0].text, /"started":true/);
  assert.ok(memory.calls.includes("campaigns.start"));
  assert.ok(!memory.calls.some((call) => call.toLowerCase().includes("send")));

  memory.seedThread({
    id: "reply-1",
    mailbox_id: "box-1",
    contact_id: null,
    from_email: "jane@harbor-dental.test",
    subject: "Re: Hi",
    received_at: "2026-11-20T00:00:00.000Z",
    kind: "reply",
    messages: [],
  });
  const draft = await handleMcpMessage(memory.services, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "draft_reply", arguments: { id: "reply-1", body: "Draft only." } },
  });
  assert.equal((draft?.result as { isError: boolean }).isError, false);
  assert.equal(memory.drafts[0]?.body, "Draft only.");
});
