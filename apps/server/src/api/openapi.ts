import { API_ROUTES } from "./routes.js";

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
};

export function openApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of API_ROUTES) {
    const item = paths[route.path] ?? {};
    item[route.method.toLowerCase()] = {
      operationId: route.operationId,
      summary: route.summary,
      description: route.description,
      tags: [route.tag],
      responses: {
        "200": { description: "Success" },
        "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
        "401": { description: "Missing or invalid API key", content: { "application/json": { schema: errorSchema } } },
        "403": {
          description: "The request tried to change a sending limit.",
          content: { "application/json": { schema: errorSchema } },
        },
        "404": { description: "Not found", content: { "application/json": { schema: errorSchema } } },
      },
    };
    paths[route.path] = item;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "WarmySender",
      version: "0.1.0",
      description:
        "Self-hosted cold email API. Endpoints never send a message directly and can never raise a limit. The scheduler sends inside safe limits.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "API key from Settings → API keys." },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}
