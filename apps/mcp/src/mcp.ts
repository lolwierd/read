// Stateless MCP server over Streamable HTTP (JSON-RPC 2.0). No Durable Objects: each
// POST is a self-contained request/response. Implements initialize, tools/list,
// tools/call, ping, and acks notifications. Lifted from cut's proven handler.

import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOLS, TOOLS_BY_NAME, type ToolCtx } from "./tools.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "read-mcp", version: "0.1.0" };

// Strip the top-level `$schema` key: OpenAI/ChatGPT's tool-schema validator rejects
// unknown top-level keywords, which silently drops every tool.
function toInputSchema(schema: Parameters<typeof zodToJsonSchema>[0]): Record<string, unknown> {
  const js = zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
  delete js["$schema"];
  if (js["type"] === undefined) js["type"] = "object";
  return js;
}
const TOOL_LIST = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: toInputSchema(t.schema),
}));

function result(id: string | number | null, value: unknown): object {
  return { jsonrpc: "2.0", id, result: value };
}
function error(id: string | number | null, code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Handle a single JSON-RPC message. Returns null for notifications (no response). */
async function handleOne(msg: unknown, ctx: ToolCtx): Promise<object | null> {
  if (!isObj(msg) || msg["jsonrpc"] !== "2.0" || typeof msg["method"] !== "string") {
    const id = isObj(msg) && (typeof msg["id"] === "string" || typeof msg["id"] === "number") ? msg["id"] : null;
    return error(id, -32600, "Invalid Request");
  }
  // A JSON-RPC notification has no `id` member and MUST NOT get a response.
  if (!("id" in msg)) return null;

  const method = msg["method"] as string;
  const id = (msg["id"] ?? null) as string | number | null;
  const params = isObj(msg["params"]) ? msg["params"] : {};

  switch (method) {
    case "initialize": {
      const requested = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : PROTOCOL_VERSION;
      return result(id, { protocolVersion: requested, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: TOOL_LIST });
    case "tools/call": {
      const name = params["name"];
      const args = isObj(params["arguments"]) ? params["arguments"] : {};
      if (typeof name !== "string") return error(id, -32602, "Invalid params: missing tool name");
      const t = TOOLS_BY_NAME.get(name);
      if (t === undefined) return error(id, -32602, `Unknown tool: ${name}`);
      const parsed = t.schema.safeParse(args);
      if (!parsed.success) {
        const text = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        return result(id, { content: [{ type: "text", text: `Invalid arguments: ${text}` }], isError: true });
      }
      try {
        const data = await t.handler(ctx, parsed.data);
        return result(id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as object });
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        return result(id, { content: [{ type: "text", text: `Tool error: ${text}` }], isError: true });
      }
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function jsonRpc(value: object, status = 200): Response {
  return Response.json(value, { status, headers: CORS_HEADERS });
}

/** Entry point: turns an HTTP request into MCP JSON-RPC handling. */
export async function handleMcp(request: Request, ctx: ToolCtx): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method === "GET") return jsonRpc({ jsonrpc: "2.0", result: { tools: TOOL_LIST } });
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { ...CORS_HEADERS, Allow: "GET, POST, OPTIONS" } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpc(error(null, -32700, "Parse error"));
  }

  if (Array.isArray(body)) {
    if (body.length === 0) return jsonRpc(error(null, -32600, "Invalid Request"));
    const responses: object[] = [];
    for (const m of body) {
      const r = await handleOne(m, ctx);
      if (r !== null) responses.push(r);
    }
    if (responses.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
    return jsonRpc(responses as unknown as object);
  }

  const res = await handleOne(body, ctx);
  if (res === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return jsonRpc(res);
}
