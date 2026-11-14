// Minimal OAuth 2.1 + Streamable HTTP MCP server for local integration tests.
// It is a synthetic fixture, not product content or a marketplace entry.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

const port = Number(process.env.MCP_MOCK_PORT ?? 19090);
const origin = `http://127.0.0.1:${port}`;
const codes = new Map();
const tokens = new Set();
const refreshes = new Set();
const staticBearer = process.env.MCP_MOCK_BEARER ?? "";
const staticApiKey = process.env.MCP_MOCK_API_KEY ?? "";

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
function form(text) { return Object.fromEntries(new URLSearchParams(text)); }

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", origin);
  if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
    return json(response, 200, { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ["mcp.read"] });
  }
  if (url.pathname === "/.well-known/oauth-authorization-server") {
    return json(response, 200, {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      scopes_supported: ["mcp.read"],
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  }
  if (url.pathname === "/register" && request.method === "POST") {
    return json(response, 201, { client_id: "mock-eduflow-client", redirect_uris: [`${origin}/api/workflows?resource=mcp-auth&op=callback`], token_endpoint_auth_method: "none" });
  }
  if (url.pathname === "/authorize" && request.method === "GET") {
    const redirect = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const challenge = url.searchParams.get("code_challenge");
    if (!redirect || !state || !challenge || !url.searchParams.get("client_id")) return json(response, 400, { error: "invalid_request" });
    const code = randomUUID();
    codes.set(code, { challenge, redirect, clientId: url.searchParams.get("client_id") });
    const target = new URL(redirect);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    response.writeHead(302, { location: target.toString(), "cache-control": "no-store" });
    return response.end();
  }
  if (url.pathname === "/token" && request.method === "POST") {
    const body = form(await readBody(request));
    if (body.grant_type === "authorization_code") {
      const entry = codes.get(body.code);
      const challenge = body.code_verifier ? createHash("sha256").update(body.code_verifier).digest("base64url") : "";
      if (!entry || entry.clientId !== body.client_id || entry.redirect !== body.redirect_uri || entry.challenge !== challenge) return json(response, 400, { error: "invalid_grant" });
      codes.delete(body.code);
      const access = `mock-access-${randomUUID()}`;
      const refresh = `mock-refresh-${randomUUID()}`;
      tokens.add(access); refreshes.add(refresh);
      return json(response, 200, { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope: "mcp.read" });
    }
    if (body.grant_type === "refresh_token" && refreshes.has(body.refresh_token)) {
      const access = `mock-access-${randomUUID()}`;
      tokens.add(access);
      return json(response, 200, { access_token: access, token_type: "Bearer", expires_in: 3600, scope: "mcp.read" });
    }
    return json(response, 400, { error: "invalid_grant" });
  }
  if (url.pathname === "/mcp") {
    if (request.method !== "POST") { response.writeHead(405); return response.end(); }
    const auth = request.headers.authorization ?? "";
    const access = auth.replace(/^Bearer\s+/i, "");
    const apiKey = request.headers['x-api-key'];
    if (!tokens.has(access) && access !== 'mock-api-key' && access !== staticBearer && apiKey !== 'mock-api-key' && apiKey !== staticApiKey) {
      return json(response, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } }, { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` });
    }
    const raw = await readBody(request);
    let message;
    try { message = JSON.parse(raw); } catch { return json(response, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
    const reply = (result) => json(response, 200, { jsonrpc: "2.0", id: message.id, result }, { "mcp-session-id": "mock-session" });
    if (message.method === "initialize") return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "eduflow-oauth-fixture", version: "1.0.0" } });
    if (message.method === "notifications/initialized") { response.writeHead(202); return response.end(); }
    if (message.method === "tools/list") return reply({ tools: [
      { name: "echo", description: "Echo a message", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false } },
      { name: "add", description: "Add two numbers", inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"], additionalProperties: false } },
    ] });
    if (message.method === "tools/call") {
      const name = message.params?.name;
      const args = message.params?.arguments ?? {};
      if (name === "echo") return reply({ content: [{ type: "text", text: `Echo: ${args.message ?? ""}` }], isError: false });
      if (name === "add") return reply({ content: [{ type: "text", text: String(Number(args.a) + Number(args.b)) }], isError: false });
      return reply({ content: [{ type: "text", text: "unknown tool" }], isError: true });
    }
    return json(response, 200, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } });
  }
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  return json(response, 404, { error: "not_found" });
});
server.listen(port, "127.0.0.1", () => console.log(`mcp-oauth-mock listening on ${origin}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
