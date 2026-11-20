import { ApiError } from "../api/errors.js";
import type { AppServices } from "../api/services.js";
import { callMcpTool, MCP_TOOLS } from "./tools.js";

const PROTOCOL_VERSIONS = ["2025-03-26", "2025-06-18"];

export async function handleMcpMessage(services: AppServices, message: unknown): Promise<Record<string, unknown> | null> {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, -32600, "Invalid request.");
  }
  const record = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const id = record.id === undefined ? undefined : record.id;
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string") {
    return rpcError(id ?? null, -32600, "Invalid request.");
  }
  if (id === undefined) {
    return null;
  }

  try {
    if (record.method === "initialize") {
      const params = record.params;
      const requested =
        params !== null && typeof params === "object" && "protocolVersion" in params
          ? (params as { protocolVersion?: unknown }).protocolVersion
          : undefined;
      const protocolVersion = typeof requested === "string" && PROTOCOL_VERSIONS.includes(requested) ? requested : "2025-03-26";
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "warmysender", version: "0.1.0" },
        instructions: "Tools never send directly and can never raise a limit; the scheduler sends inside safe limits.",
      });
    }
    if (record.method === "ping") return rpcResult(id, {});
    if (record.method === "tools/list") {
      return rpcResult(id, {
        tools: MCP_TOOLS.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
      });
    }
    if (record.method === "tools/call") {
      const params = record.params;
      if (params === null || typeof params !== "object" || Array.isArray(params)) {
        return rpcError(id, -32602, "Invalid params.");
      }
      const name = (params as { name?: unknown }).name;
      if (typeof name !== "string") return rpcError(id, -32602, "Tool name is required.");
      try {
        const called = await callMcpTool(services, name, (params as { arguments?: unknown }).arguments);
        return rpcResult(id, { content: [{ type: "text", text: called.text }], isError: called.isError });
      } catch (error) {
        if (error instanceof ApiError && error.code === "unknown_tool") return rpcError(id, -32602, error.message);
        throw error;
      }
    }
    return rpcError(id, -32601, `Method not found: ${record.method}.`);
  } catch {
    return rpcError(id, -32603, "Something went wrong.");
  }
}

function rpcResult(id: unknown, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
