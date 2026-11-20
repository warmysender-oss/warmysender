# Connect an agent

The app exposes MCP at `/mcp` on the same origin as the UI (`PUBLIC_URL`). Auth is an app API key: create one under Settings → API keys. The key is shown once.

| Setting | Value |
| --- | --- |
| URL | `{PUBLIC_URL}/mcp` (local Compose: `http://localhost:3000/mcp`) |
| Transport | Streamable HTTP |
| Header | `Authorization: Bearer <app API key>` |

Tools create and start campaigns, and `draft_reply` saves a draft. The scheduler sends, inside the caps, window, gap, and ramp. A tool cannot raise a limit, and it cannot send a message itself. A person sends a draft from the inbox.

Install the skills with:

```bash
npx skills add warmysender-oss/warmysender
```

Put the API key in an environment variable named `WARMYSENDER_API_KEY` for the snippets below. Do not commit the key.

## Claude

Two official paths. Use the one that can reach your server.

**Claude (claude.ai and the desktop app), public HTTPS.** Customize → Connectors → Add custom connector. Set the MCP server URL to `https://<your host>/mcp`. Choose **No sign-in** and add a request header named `Authorization` whose value is `Bearer <app API key>`, including the word `Bearer` and the space. Claude sends the value exactly as you type it. Source: https://claude.com/docs/connectors/custom/add-unlisted

Request headers on that dialog are in beta and only some organizations see them. When the dialog has no Request headers section, use Claude Code below.

**Claude Code**, including a server on `http://localhost:3000`. From a terminal, not from inside a `claude` session (https://code.claude.com/docs/en/mcp):

```bash
claude mcp add --transport http warmysender http://localhost:3000/mcp \
  --header "Authorization: Bearer $WARMYSENDER_API_KEY"
```

The same header in a project `.mcp.json` uses `"type": "http"` (`"streamable-http"` is an alias in that file) and `"Authorization": "Bearer ${WARMYSENDER_API_KEY}"`.

## ChatGPT

ChatGPT on the web connects a remote MCP server as a plugin: Plugins → + → Add custom MCP server, and enter `{PUBLIC_URL}/mcp`. The authentication options on that form are OAuth, no authentication, and OAuth or no authentication (https://developers.openai.com/api/docs/guides/custom-mcp-server).

Bearer auth is the shared Codex configuration. The ChatGPT desktop app, the Codex CLI, and the Codex IDE extension read the same file (https://learn.chatgpt.com/docs/extend/mcp). In the desktop app: Settings → MCP servers → Add server → Streamable HTTP → the URL above → Save → Restart. The bearer token itself is `bearer_token_env_var` in that file, in the Codex section below.

## Cursor

Cursor reads `.cursor/mcp.json` in a project and `~/.cursor/mcp.json` for every project (https://cursor.com/docs/mcp). A remote server is a `url` plus `headers`. `${env:NAME}` is expanded in `headers`. Remote servers do not read `envFile`. Restart Cursor after saving.

```json
{
  "mcpServers": {
    "warmysender": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${env:WARMYSENDER_API_KEY}"
      }
    }
  }
}
```

Set `WARMYSENDER_API_KEY` in the environment Cursor inherits, then restart Cursor.

## Codex

Codex stores MCP servers in `~/.codex/config.toml`, or in `.codex/config.toml` for a trusted project. `bearer_token_env_var` names the environment variable Codex sends as `Authorization: Bearer` (https://learn.chatgpt.com/docs/extend/mcp). The CLI flag is `--bearer-token-env-var`, and it requires `--url` (`codex mcp add`).

```toml
[mcp_servers.warmysender]
url = "http://localhost:3000/mcp"
bearer_token_env_var = "WARMYSENDER_API_KEY"
```

```bash
codex mcp add warmysender \
  --url http://localhost:3000/mcp \
  --bearer-token-env-var WARMYSENDER_API_KEY
```

Export `WARMYSENDER_API_KEY` in the environment that starts Codex. In the CLI, `/mcp` lists connected servers.

## OpenClaw

OpenClaw reads `~/.openclaw/openclaw.json` (JSON5), or `OPENCLAW_CONFIG_PATH` (https://docs.openclaw.ai/docs/configuration). HTTP servers live under `mcp.servers` with `transport: "streamable-http"`. A header may reference an environment variable as `${WARMYSENDER_API_KEY}` (https://docs.openclaw.ai/gateway/config-extensions). Doctor warns when a header holds a literal secret, so keep the reference and put the key in the environment OpenClaw reads.

```json5
{
  mcp: {
    servers: {
      warmysender: {
        url: "http://localhost:3000/mcp",
        transport: "streamable-http",
        headers: {
          Authorization: "Bearer ${WARMYSENDER_API_KEY}",
        },
      },
    },
  },
}
```

You can add the URL from the CLI, then confirm the header in that file. The documented URL form is (https://docs.openclaw.ai/tools/mcp):

```bash
openclaw mcp add warmysender \
  --url http://localhost:3000/mcp \
  --transport streamable-http
openclaw mcp doctor warmysender --probe
```

The Settings → MCP screen writes the same `mcp.servers` entry. Headers are edited in the config editor on that page. This server uses the bearer header above. Leave `auth` unset. `auth: "oauth"` is the other OpenClaw mode, for servers that sign in with OAuth.

## Hermes Agent

Hermes reads `~/.hermes/config.yaml` under `mcp_servers` (https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp). An HTTP server is a `url` and optional `headers`. Streamable HTTP is the transport when `transport` is omitted. Set `transport: sse` only for an SSE endpoint. This app's endpoint is Streamable HTTP.

String values in `headers` expand `${VAR}` and `${env:VAR}` from `~/.hermes/.env` (https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference).

```yaml
mcp_servers:
  warmysender:
    url: "http://localhost:3000/mcp"
    headers:
      Authorization: "Bearer ${WARMYSENDER_API_KEY}"
```

`~/.hermes/.env`:

```bash
WARMYSENDER_API_KEY=your-app-api-key
```

## Any other MCP client

Use the table at the top: Streamable HTTP, `{PUBLIC_URL}/mcp`, header `Authorization: Bearer <app API key>`.
