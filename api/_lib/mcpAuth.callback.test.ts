import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

const testState = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("./supabase.js", () => ({ createServerSupabase: () => testState.supabase }));
vi.mock("./workflowV2Protocol.js", () => ({
  workflowCompiler: vi.fn(async (_path: string, body: { action?: string }) => body.action === "test" ? { ok: true, tools: [{ name: "echo" }] } : { ok: true }),
}));

import { handleMcpOAuthCallback, startMcpOAuth, discoverMcpOAuth } from "./mcpAuth";

type Hit = { method: string; path: string; headers: IncomingMessage["headers"]; body: string };
function server(handler: (hit: Hit, response: ServerResponse) => boolean | void) {
  const hits: Hit[] = [];
  const instance = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const hit = { method: request.method ?? "GET", path: new URL(request.url ?? "/", "http://127.0.0.1").pathname, headers: request.headers, body: Buffer.concat(chunks).toString("utf8") };
    hits.push(hit);
    if (!handler(hit, response)) { response.writeHead(404, { "content-type": "application/json" }); response.end("{}"); }
  });
  return new Promise<{ origin: string; hits: Hit[]; close: () => Promise<void> }>((resolve) => {
    instance.listen(0, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`;
      resolve({ origin, hits, close: () => new Promise<void>((done) => instance.close(() => done())) });
    });
  });
}
function fakeSupabase(flow: Record<string, unknown> | null, inserted: Record<string, unknown>[] = []) {
  const claimed = { data: flow, error: null };
  const chain: Record<string, unknown> = {
    update: () => chain, delete: () => chain, eq: () => chain, is: () => chain, gt: () => chain,
    select: () => ({ maybeSingle: async () => claimed }),
    lt: () => Promise.resolve({ error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return {
    from: () => ({
      ...chain,
      insert: async (values: Record<string, unknown>) => { inserted.push(values); return { error: null }; },
    }),
  };
}
function fakeClaimOnce(flow: Record<string, unknown>) {
  let claimed = false;
  const chain: Record<string, unknown> = {
    update: () => chain, delete: () => chain, eq: () => chain, is: () => chain, gt: () => chain,
    select: () => ({ maybeSingle: async () => {
      if (claimed) return { data: null, error: null };
      claimed = true;
      return { data: flow, error: null };
    } }),
    lt: () => Promise.resolve({ error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return { from: () => chain };
}
function snapshot(origin: string, overrides: { issuer?: string; tokenEndpoint?: string; resource?: string } = {}) {
  const issuer = overrides.issuer ?? origin;
  const tokenEndpoint = overrides.tokenEndpoint ?? `${origin}/token`;
  const resource = overrides.resource ?? `${origin}/mcp`;
  return {
    v: 1,
    content: {
      type: "mcp-http", name: "Mock MCP", url: `${origin}/mcp`, transport: "streamable-http", authType: "oauth", allowedToolNames: [],
      oauth: { issuer, authorizationEndpoint: `${origin}/authorize`, tokenEndpoint, clientId: "client", resource, scope: "mcp.read", tokenEndpointAuthMethod: "client_secret_post" },
    },
    discovery: {
      issuer, authorizationServerUrl: issuer, resource,
      authorizationServerMetadata: {
        issuer, authorization_endpoint: `${origin}/authorize`, token_endpoint: tokenEndpoint,
        response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      },
      resourceMetadata: { resource, authorization_servers: [issuer], scopes_supported: ["mcp.read"] },
    },
  };
}

const originalOrigin = process.env.MCP_PUBLIC_ORIGIN;
const originalFixtures = process.env.MCP_ALLOW_LOCAL_FIXTURES;
beforeEach(() => {
  process.env.MCP_PUBLIC_ORIGIN = "https://eduflow.example.com";
  process.env.MCP_ALLOW_LOCAL_FIXTURES = "1";
});
afterEach(() => {
  if (originalOrigin === undefined) delete process.env.MCP_PUBLIC_ORIGIN; else process.env.MCP_PUBLIC_ORIGIN = originalOrigin;
  if (originalFixtures === undefined) delete process.env.MCP_ALLOW_LOCAL_FIXTURES; else process.env.MCP_ALLOW_LOCAL_FIXTURES = originalFixtures;
  testState.supabase = null;
});

describe("MCP OAuth callback binds the verified authorization server", () => {
  it("uses the stored discovery and never sends the client secret to a changed endpoint", async () => {
    let currentOrigin = "";
    const oldAs = await server((hit, response) => {
      if (hit.path === "/.well-known/oauth-protected-resource") {
        // A malicious/compromised resource now advertises a different AS. A
        // rediscovering callback would follow this; the saved snapshot must not.
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ resource: `${currentOrigin}/mcp`, authorization_servers: [currentOrigin], scopes_supported: ["mcp.read"] }));
        return true;
      }
      if (hit.path === "/token") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ access_token: "access", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600 }));
        return true;
      }
      return false;
    });
    const newAs = await server((hit, response) => {
      if (hit.path === "/token") { response.writeHead(500); response.end("{}"); return true; }
      return false;
    });
    currentOrigin = newAs.origin;
    const flow = {
      flow_id: "9a4800d2-74f0-4f40-a4fe-74f4e3d9a5c1", state_hash: "hash", owner_user_id: "owner", environment_ref: "local",
      connection_ref: "mock", connection_version: 2, payload: snapshot(oldAs.origin, { issuer: oldAs.origin, tokenEndpoint: `${oldAs.origin}/token`, resource: `${oldAs.origin}/mcp` }),
      code_verifier: "v".repeat(64), client_id: "client", client_secret: "super-secret",
      token_endpoint: `${oldAs.origin}/token`, authorization_endpoint: `${oldAs.origin}/authorize`, resource: `${oldAs.origin}/mcp`,
      redirect_uri: "https://eduflow.example.com/api/workflows?resource=mcp-auth&op=callback", return_to: "/works",
      expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
    };
    testState.supabase = fakeSupabase(flow);
    const response = { statusCode: 0, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value; }, end() {} };
    await handleMcpOAuthCallback({ query: { state: "state", code: "code" } } as never, response as never);
    expect(response.headers.location).toContain("mcpOAuth=pending");
    expect(oldAs.hits.filter((hit) => hit.path === "/token")).toHaveLength(1);
    expect(newAs.hits.filter((hit) => hit.path === "/token")).toHaveLength(0);
    expect(oldAs.hits.find((hit) => hit.path === "/token")?.body).toContain("super-secret");
    await oldAs.close(); await newAs.close();
  });

  it("rejects changed issuer/resource before exchanging the code", async () => {
    const oldAs = await server((_hit, response) => { response.writeHead(500); response.end("{}"); return true; });
    const newAs = await server((_hit, response) => { response.writeHead(500); response.end("{}"); return true; });
    const changed = snapshot(oldAs.origin, { issuer: newAs.origin, tokenEndpoint: `${newAs.origin}/token`, resource: `${newAs.origin}/mcp` });
    const flow = {
      flow_id: "9a4800d2-74f0-4f40-a4fe-74f4e3d9a5c2", state_hash: "hash", owner_user_id: "owner", environment_ref: "local",
      connection_ref: "mock", connection_version: 2, payload: changed, code_verifier: "v".repeat(64), client_id: "client",
      client_secret: "super-secret", token_endpoint: `${oldAs.origin}/token`, authorization_endpoint: `${oldAs.origin}/authorize`,
      resource: `${oldAs.origin}/mcp`, redirect_uri: "https://eduflow.example.com/api/workflows?resource=mcp-auth&op=callback", return_to: "/works",
      expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
    };
    testState.supabase = fakeSupabase(flow);
    const response = { statusCode: 0, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value; }, end() {} };
    await handleMcpOAuthCallback({ query: { state: "state", code: "code" } } as never, response as never);
    expect(response.headers.location).toContain("mcpOAuth=error");
    expect(oldAs.hits.filter((hit) => hit.path === "/token")).toHaveLength(0);
    expect(newAs.hits.filter((hit) => hit.path === "/token")).toHaveLength(0);
    await oldAs.close(); await newAs.close();
  });
});

describe("MCP OAuth WWW-Authenticate discovery", () => {
  it("uses resource_metadata from an unauthenticated 401 and requests only the chosen scope", async () => {
    let origin = "";
    const as = await server((hit, response) => {
      if (hit.path === "/mcp" && hit.method === "POST") {
        response.writeHead(401, {
          "content-type": "application/json",
          "www-authenticate": `Bearer resource_metadata="${origin}/custom-prm", scope="mcp.read"`,
        });
        response.end("{}");
        return true;
      }
      if (hit.path === "/custom-prm") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ["mcp.read", "mcp.admin"] }));
        return true;
      }
      if (hit.path === "/.well-known/oauth-authorization-server") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`, scopes_supported: ["mcp.read", "mcp.admin"],
          response_types_supported: ["code"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
        }));
        return true;
      }
      if (hit.path === "/register" && hit.method === "POST") {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ client_id: "challenge-client", redirect_uris: ["https://eduflow.example.com/api/workflows?resource=mcp-auth&op=callback"], token_endpoint_auth_method: "none" }));
        return true;
      }
      return false;
    });
    origin = as.origin;
    const discovery = await discoverMcpOAuth({ url: `${origin}/mcp` });
    expect(discovery.resourceMetadataUrl).toBe(`${origin}/custom-prm`);
    expect(discovery.scopes).toEqual(expect.arrayContaining(["mcp.read", "mcp.admin"]));

    const inserted: Record<string, unknown>[] = [];
    testState.supabase = fakeSupabase(null, inserted);
    await expect(startMcpOAuth({
      request: { headers: {} } as never, ownerId: "owner", environmentRef: "local", ref: "challenge",
      version: 1, name: "Challenge", url: `${origin}/mcp`, transport: "streamable-http",
    })).rejects.toMatchObject({ code: "MCP_OAUTH_SCOPE_REQUIRED" });
    expect(as.hits.filter((hit) => hit.path === "/register")).toHaveLength(0);

    const started = await startMcpOAuth({
      request: { headers: {} } as never, ownerId: "owner", environmentRef: "local", ref: "challenge",
      version: 1, name: "Challenge", url: `${origin}/mcp`, transport: "streamable-http", scopes: ["mcp.read"],
      resourceMetadataUrl: discovery.resourceMetadataUrl,
    });
    const authorization = new URL(started.authorizationUrl);
    expect(authorization.searchParams.get("scope")).toBe("mcp.read");
    expect(authorization.searchParams.get("resource")).toBe(`${origin}/mcp`);
    expect(inserted[0]?.payload).toMatchObject({ v: 1, discovery: { resourceMetadataUrl: `${origin}/custom-prm` } });
    await as.close();
  });
});


describe("MCP OAuth callback concurrency, denial and discovery errors", () => {
  it("accepts exactly one of two concurrent callbacks for the same state", async () => {
    let tokenHits = 0;
    const as = await server((hit, response) => {
      if (hit.path === "/token") {
        tokenHits += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ access_token: "access", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600 }));
        return true;
      }
      return false;
    });
    const flow = {
      flow_id: "9a4800d2-74f0-4f40-a4fe-74f4e3d9a5c3", state_hash: "hash", owner_user_id: "owner", environment_ref: "local",
      connection_ref: "mock", connection_version: 2, payload: snapshot(as.origin),
      code_verifier: "v".repeat(64), client_id: "client", client_secret: "super-secret",
      token_endpoint: `${as.origin}/token`, authorization_endpoint: `${as.origin}/authorize`, resource: `${as.origin}/mcp`,
      redirect_uri: "https://eduflow.example.com/api/workflows?resource=mcp-auth&op=callback", return_to: "/works",
      expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
    };
    testState.supabase = fakeClaimOnce(flow);
    const responses = Array.from({ length: 2 }, () => ({ statusCode: 0, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value; }, end() {} }));
    await Promise.all(responses.map((response) => handleMcpOAuthCallback({ query: { state: "state", code: "code" } } as never, response as never)));
    expect(tokenHits).toBe(1);
    expect(responses.filter((response) => response.headers.location?.includes("mcpOAuth=pending"))).toHaveLength(1);
    expect(responses.filter((response) => response.headers.location?.includes("mcpOAuth=error"))).toHaveLength(1);
    await as.close();
  });

  it("consumes a denied callback without exchanging a code", async () => {
    let tokenHits = 0;
    const as = await server((hit, response) => {
      if (hit.path === "/token") { tokenHits += 1; response.writeHead(500); response.end("{}"); return true; }
      return false;
    });
    const flow = {
      flow_id: "9a4800d2-74f0-4f40-a4fe-74f4e3d9a5c4", state_hash: "hash", owner_user_id: "owner", environment_ref: "local",
      connection_ref: "mock", connection_version: 2, payload: snapshot(as.origin), code_verifier: "v".repeat(64), client_id: "client",
      client_secret: "super-secret", token_endpoint: `${as.origin}/token`, authorization_endpoint: `${as.origin}/authorize`, resource: `${as.origin}/mcp`,
      redirect_uri: "https://eduflow.example.com/api/workflows?resource=mcp-auth&op=callback", return_to: "/works",
      expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
    };
    testState.supabase = fakeSupabase(flow);
    const response = { statusCode: 0, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value; }, end() {} };
    await handleMcpOAuthCallback({ query: { state: "state", error: "access_denied" } } as never, response as never);
    expect(response.headers.location).toContain("mcpOAuth=error");
    expect(tokenHits).toBe(0);
    await as.close();
  });

  it("rejects a replayed or expired state without any token request", async () => {
    let tokenHits = 0;
    const as = await server((hit, response) => {
      if (hit.path === "/token") { tokenHits += 1; response.writeHead(500); response.end("{}"); return true; }
      return false;
    });
    testState.supabase = fakeSupabase(null);
    const response = { statusCode: 0, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value; }, end() {} };
    await handleMcpOAuthCallback({ query: { state: "already-consumed", code: "code" } } as never, response as never);
    expect(response.headers.location).toContain("mcpOAuth=error");
    expect(tokenHits).toBe(0);
    await as.close();
  });

  it("reports an unusable discovery response without starting a client registration", async () => {
    const as = await server((hit, response) => {
      if (hit.path === "/mcp") { response.writeHead(401, { "www-authenticate": "Bearer" }); response.end("{}"); return true; }
      response.writeHead(404); response.end("{}"); return true;
    });
    await expect(discoverMcpOAuth({ url: `${as.origin}/mcp` })).rejects.toMatchObject({ code: expect.stringMatching(/MCP_OAUTH_(DISCOVERY_FAILED|UNSUPPORTED)/) });
    await as.close();
  });
});
