import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SAFETY_SENTENCE } from "../api/limits.js";
import type { AppServices } from "../api/services.js";
import { callMcpTool, MCP_TOOLS } from "./tools.js";

/**
 * Streamable HTTP at /mcp. One server per request (stateless): no session, JSON body.
 * The scheduler sends. These tools never do, and they never raise a limit.
 */
export async function handleMcpHttp(services: AppServices, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  const server = new Server(
    { name: "warmysender", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: SAFETY_SENTENCE },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as { type: "object"; properties?: Record<string, object> },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const called = await callMcpTool(services, request.params.name, request.params.arguments);
      return { content: [{ type: "text" as const, text: called.text }], isError: called.isError };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    await transport.handleRequest(req, res, body);
  } finally {
    await transport.close();
    await server.close();
  }
}
