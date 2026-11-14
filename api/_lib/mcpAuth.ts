import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { auth, discoverOAuthServerInfo, extractWWWAuthenticateParams, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthProtectedResourceMetadata, OAuthTokens, AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { checkResourceAllowed } from "@modelcontextprotocol/sdk/shared/auth-utils.js";
import { ApiError } from "./http.js";
import { createServerSupabase } from "./supabase.js";
import { assertPublicDestination, pinnedRequest } from "./outbound.js";
import { workflowCompiler } from "./workflowV2Protocol.js";

type FlowRow = {
  flow_id: string;
  state_hash: string;
  owner_user_id: string;
  environment_ref: string;
  connection_ref: string;
  connection_version: number;
  payload: Record<string, unknown>;
  code_verifier: string;
  client_id: string;
  client_secret: string | null;
  token_endpoint: string;
  authorization_endpoint: string;
  resource: string | null;
  redirect_uri: string;
  return_to: string;
  expires_at: string;
  consumed_at: string | null;
};
type Discovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  resource: string;
  resourceMetadataUrl?: string;
  info: OAuthDiscoveryState;
  metadata: AuthorizationServerMetadata;
  resourceMetadata?: OAuthProtectedResourceMetadata;
  scopes: string[];
};

const FLOW_TTL_MS = 10 * 60 * 1000;
const MAX_SECRET_LENGTH = 7000;
const SCOPE_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]{1,120}$/;

function base64url(value: Buffer) { return value.toString("base64url"); }
function sha256(value: string) { return createHash("sha256").update(value).digest(); }
function safeMessage(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : fallback;
  return message
    .replace(/(?:access|refresh)[_-]?token\s*[=:]\s*\S+/gi, "[REDACTED]")
    .replace(/(?:client[_-]?secret|code[_-]?verifier)\s*[=:]\s*\S+/gi, "[REDACTED]")
    .slice(0, 300);
}
function legalReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/works";
  return value;
}
function configuredOrigin() {
  const raw = process.env.MCP_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("MCP_PUBLIC_ORIGIN 必须是完整来源"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("MCP_PUBLIC_ORIGIN 必须是完整来源");
  }
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("MCP_PUBLIC_ORIGIN 必须使用 HTTPS");
  }
  return url.origin;
}

/**
 * The OAuth redirect URI is derived only from an explicitly configured origin.
 * Preview/Production never trust a request-supplied Host header, because that
 * would let an attacker receive the authorization code.
 */
export function oauthCallbackUrl(request: VercelRequest) {
  const configured = configuredOrigin();
  if (configured) return `${configured}/api/workflows?resource=mcp-auth&op=callback`;
  if (process.env.VERCEL_ENV || process.env.NODE_ENV === "production") {
    throw new Error("MCP_PUBLIC_ORIGIN 未配置，OAuth 回调来源不可信");
  }
  const host = String(request.headers.host ?? "").split(",")[0].trim().toLowerCase();
  if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) throw new Error("MCP_PUBLIC_ORIGIN 未配置，OAuth 回调来源不可信");
  return `http://${host}/api/workflows?resource=mcp-auth&op=callback`;
}

function headerRecord(headers: HeadersInit | undefined) {
  if (!headers) return {};
  const entries = headers instanceof Headers ? [...headers.entries()] : Array.isArray(headers) ? headers : Object.entries(headers);
  return Object.fromEntries(entries.map(([name, value]) => [name.toLowerCase(), String(value)]));
}

/** A fetch adapter that resolves once, pins the checked IP, and never follows a redirect itself. */
export async function safeOAuthFetch(input: string | URL | Request, init: RequestInit = {}) {
  const raw = input instanceof Request ? input.url : String(input);
  const destination = await assertPublicDestination(raw, "OAuth 地址");
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") throw new Error("OAuth 请求方法不支持");
  let body: string | undefined;
  if (init.body !== undefined && init.body !== null) {
    if (typeof init.body !== "string" && !(init.body instanceof URLSearchParams)) throw new Error("OAuth 请求体不支持");
    body = String(init.body);
  }
  const response = await pinnedRequest(destination, {
    method: method as "GET" | "POST",
    headers: headerRecord(init.headers),
    body,
    timeoutMs: 20000,
  });
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (typeof value !== "string") continue;
    if (["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length", "set-cookie"].includes(name)) continue;
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

function normalizeIssuer(value: string) {
  try { return new URL(value).href.replace(/\/+$/, ""); } catch { return value; }
}
async function assertEndpoint(raw: string | undefined, label: string) {
  if (!raw) throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", `OAuth ${label}缺失`);
  await assertPublicDestination(raw, label).catch((reason) => { throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", safeMessage(reason, `${label}不可用`)); });
}
function scopeList(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && SCOPE_PATTERN.test(value)))].slice(0, 50);
}
type FlowSnapshot = {
  v: 1;
  content: Record<string, unknown>;
  discovery: {
    issuer: string;
    authorizationServerUrl: string;
    authorizationServerMetadata: AuthorizationServerMetadata;
    resourceMetadata?: OAuthProtectedResourceMetadata;
    resourceMetadataUrl?: string;
    resource: string;
  };
};
function flowContent(flow: FlowRow) {
  const value = flow.payload;
  return value && typeof value === "object" && value.content && typeof value.content === "object" && !Array.isArray(value.content)
    ? value.content as Record<string, unknown>
    : value;
}
function flowSnapshot(flow: FlowRow): FlowSnapshot | null {
  const value = flow.payload;
  if (!value || typeof value !== "object" || !value.discovery || typeof value.discovery !== "object") return null;
  return value as unknown as FlowSnapshot;
}

/**
 * A no-credential MCP initialize request exposes the server's RFC 9728
 * challenge. SDK's `discoverOAuthServerInfo` only uses a PRM URL supplied by
 * the caller, so the caller must probe the WWW-Authenticate header first.
 */
async function challengeMetadata(serverUrl: string) {
  const body = JSON.stringify({
    jsonrpc: "2.0", id: "eduflow-oauth-probe", method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "EduFlow", version: "1.0.0" } },
  });
  let response: Response;
  try {
    response = await safeOAuthFetch(serverUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body,
    });
    if (!response.headers.get("www-authenticate") && response.status === 405) {
      response = await safeOAuthFetch(serverUrl, { method: "GET", headers: { accept: "text/event-stream" } });
    }
  } catch {
    return null;
  }
  const parsed = extractWWWAuthenticateParams(response);
  if (!parsed.resourceMetadataUrl) return null;
  await assertPublicDestination(parsed.resourceMetadataUrl.toString(), "OAuth 资源元数据地址");
  return {
    resourceMetadataUrl: parsed.resourceMetadataUrl,
    scopes: parsed.scope ? parsed.scope.split(/\s+/).filter((scope) => SCOPE_PATTERN.test(scope)) : [],
  };
}

/** Official SDK discovery, with explicit issuer/resource checks for the MCP resource. */
export async function discoverMcpOAuth(input: { url: string; resourceMetadataUrl?: string }) {
  await assertPublicDestination(input.url, "MCP 服务地址");
  const challenge = input.resourceMetadataUrl ? null : await challengeMetadata(input.url);
  const resourceMetadataUrl = input.resourceMetadataUrl ? new URL(input.resourceMetadataUrl) : challenge?.resourceMetadataUrl;
  if (resourceMetadataUrl) await assertPublicDestination(resourceMetadataUrl.toString(), "OAuth 资源元数据地址");
  let discovered: Awaited<ReturnType<typeof discoverOAuthServerInfo>>;
  try {
    discovered = await discoverOAuthServerInfo(input.url, { fetchFn: safeOAuthFetch, ...(resourceMetadataUrl ? { resourceMetadataUrl } : {}) });
  } catch (reason) {
    throw new ApiError(400, "MCP_OAUTH_DISCOVERY_FAILED", safeMessage(reason, "无法读取服务方的 OAuth 元数据"));
  }
  const metadata = discovered.authorizationServerMetadata;
  if (!metadata || !metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", "该服务未公开可用的 OAuth 授权元数据，请改用 API Key 或 Bearer 连接");
  }
  if (metadata.issuer && normalizeIssuer(metadata.issuer) !== normalizeIssuer(discovered.authorizationServerUrl)) {
    throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", "OAuth 授权服务器 issuer 与发现地址不一致");
  }
  if (discovered.resourceMetadata?.resource && !checkResourceAllowed({ requestedResource: input.url, configuredResource: discovered.resourceMetadata.resource })) {
    throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", "OAuth 资源元数据与 MCP 服务地址不一致");
  }
  if (Array.isArray(discovered.resourceMetadata?.authorization_servers)) {
    for (const issuer of discovered.resourceMetadata.authorization_servers) {
      if (typeof issuer === "string") await assertEndpoint(issuer, "授权服务器地址");
    }
  }
  await assertEndpoint(metadata.authorization_endpoint, "授权地址");
  await assertEndpoint(metadata.token_endpoint, "令牌地址");
  if (metadata.registration_endpoint) await assertEndpoint(metadata.registration_endpoint, "注册地址");
  if (metadata.code_challenge_methods_supported && !metadata.code_challenge_methods_supported.includes("S256")) {
    throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", "该服务不支持 PKCE S256");
  }
  const scopes = [...new Set([...scopeList(discovered.resourceMetadata?.scopes_supported), ...scopeList(metadata.scopes_supported), ...(challenge?.scopes ?? [])])];
  return {
    issuer: metadata.issuer ?? discovered.authorizationServerUrl,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    resource: discovered.resourceMetadata?.resource ?? new URL(input.url).toString(),
    ...(resourceMetadataUrl ? { resourceMetadataUrl: resourceMetadataUrl.toString() } : {}),
    scopes,
    info: discovered as Discovery["info"],
    metadata,
    resourceMetadata: discovered.resourceMetadata,
  } satisfies Discovery;
}

function selectedScopes(discovery: Discovery, requested: unknown) {
  if (requested === undefined) {
    if (discovery.scopes.length) throw new ApiError(400, "MCP_OAUTH_SCOPE_REQUIRED", "请选择本次连接需要的授权范围", { scopes: discovery.scopes });
    return "";
  }
  if (!Array.isArray(requested) || requested.length > 20 || requested.some((value) => typeof value !== "string" || !SCOPE_PATTERN.test(value))) {
    throw new ApiError(400, "MCP_OAUTH_SCOPE", "授权范围无效");
  }
  const values = [...new Set(requested as string[])];
  if (discovery.scopes.length) {
    const unavailable = values.filter((value) => !discovery.scopes.includes(value));
    if (unavailable.length) throw new ApiError(400, "MCP_OAUTH_SCOPE", `服务不支持授权范围：${unavailable.join(", ")}`);
    if (!values.length) throw new ApiError(400, "MCP_OAUTH_SCOPE_REQUIRED", "请选择本次连接需要的授权范围", { scopes: discovery.scopes });
  } else if (values.length) {
    throw new ApiError(400, "MCP_OAUTH_SCOPE", "服务未声明可用的授权范围");
  }
  return values.join(" ");
}

class FlowProvider implements OAuthClientProvider {
  clientInfo?: OAuthClientInformationMixed;
  storedTokens?: OAuthTokens;
  verifier = "";
  authorizationUrlValue?: URL;
  discoveryValue?: OAuthDiscoveryState;
  constructor(readonly options: {
    redirectUrl: string;
    scope: string;
    state?: string;
    flow?: FlowRow;
    supabase?: SupabaseClient;
    mode: "start" | "callback";
  }) {}
  get redirectUrl() { return this.options.redirectUrl; }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "EduFlow",
      redirect_uris: [this.options.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(this.options.scope ? { scope: this.options.scope } : {}),
    };
  }
  state() { return this.options.state ?? base64url(randomBytes(32)); }
  clientInformation() {
    if (this.options.flow) {
      const content = flowContent(this.options.flow);
      const snapshot = flowSnapshot(this.options.flow);
      return {
        client_id: this.options.flow.client_id,
        ...(this.options.flow.client_secret ? { client_secret: this.options.flow.client_secret } : {}),
        token_endpoint_auth_method: (content.oauth as Record<string, unknown> | undefined)?.tokenEndpointAuthMethod ?? "none",
        // The SDK refuses to present these credentials to a different AS.
        issuer: snapshot?.discovery.authorizationServerUrl ?? snapshot?.discovery.issuer,
      } as OAuthClientInformationMixed;
    }
    return this.clientInfo;
  }
  async saveClientInformation(info: OAuthClientInformationMixed) {
    this.clientInfo = info;
    if (this.options.flow && this.options.supabase) {
      await this.options.supabase.from("mcp_oauth_flows").update({
        client_id: info.client_id,
        client_secret: typeof (info as { client_secret?: unknown }).client_secret === "string" ? (info as { client_secret: string }).client_secret : null,
      }).eq("flow_id", this.options.flow.flow_id);
    }
  }
  tokens() { return this.storedTokens; }
  saveTokens(tokens: OAuthTokens) { this.storedTokens = tokens; }
  redirectToAuthorization(url: URL) { this.authorizationUrlValue = url; }
  saveCodeVerifier(codeVerifier: string) { this.verifier = codeVerifier; }
  codeVerifier() { return this.options.flow?.code_verifier ?? this.verifier; }
  saveDiscoveryState(state: OAuthDiscoveryState) { this.discoveryValue = state; }
  discoveryState() { return this.discoveryValue; }
  async validateResourceURL(serverUrl: string | URL, resource?: string) {
    if (!resource) return undefined;
    if (!checkResourceAllowed({ requestedResource: serverUrl, configuredResource: resource })) {
      throw new Error("OAuth 资源标识与 MCP 服务地址不一致");
    }
    return new URL(resource);
  }
}

async function cleanupFlows(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - FLOW_TTL_MS * 6).toISOString();
  await Promise.all([
    supabase.from("mcp_oauth_flows").delete().lt("expires_at", cutoff),
    supabase.from("mcp_oauth_flows").delete().lt("consumed_at", cutoff),
  ]).catch(() => undefined);
}

export async function startMcpOAuth(input: {
  request: VercelRequest; ownerId: string; environmentRef: string; ref: string; version: number;
  name: string; url: string; transport: "streamable-http" | "sse"; sourceId?: string; serverTitle?: string;
  returnTo?: string; scopes?: string[]; resourceMetadataUrl?: string;
}) {
  const destination = await assertPublicDestination(input.url, "MCP 服务地址").catch((reason) => { throw new ApiError(400, "INVALID_MCP_ENDPOINT", safeMessage(reason, "MCP 服务地址不可用")); });
  let callback: string;
  try { callback = oauthCallbackUrl(input.request); }
  catch (reason) { throw new ApiError(503, "MCP_OAUTH_UNAVAILABLE", safeMessage(reason, "OAuth 回调来源未配置")); }
  const discovery = await discoverMcpOAuth({ url: destination.url.toString(), ...(input.resourceMetadataUrl ? { resourceMetadataUrl: input.resourceMetadataUrl } : {}) });
  const scope = selectedScopes(discovery, input.scopes);
  const flowId = randomUUID();
  const state = base64url(randomBytes(32));
  const supabase = createServerSupabase();
  await cleanupFlows(supabase);
  const provider = new FlowProvider({ redirectUrl: callback, scope, state, mode: "start" });
  provider.discoveryValue = {
    authorizationServerUrl: discovery.info.authorizationServerUrl,
    authorizationServerMetadata: discovery.metadata,
    resourceMetadata: discovery.resourceMetadata,
  };
  let result: Awaited<ReturnType<typeof auth>>;
  try {
    result = await auth(provider, {
      serverUrl: destination.url.toString(),
      scope: scope || undefined,
      ...(input.resourceMetadataUrl ? { resourceMetadataUrl: new URL(input.resourceMetadataUrl) } : {}),
      fetchFn: safeOAuthFetch,
    });
  } catch (reason) {
    throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", safeMessage(reason, "OAuth 客户端注册失败"));
  }
  if (result !== "REDIRECT" || !provider.authorizationUrlValue || !provider.clientInfo) {
    throw new ApiError(400, "MCP_OAUTH_UNSUPPORTED", "该服务未完成 OAuth 客户端注册");
  }
  const client = provider.clientInfo as { client_id: string; client_secret?: string; token_endpoint_auth_method?: string };
  const oauth = {
    issuer: discovery.issuer,
    authorizationEndpoint: discovery.metadata.authorization_endpoint,
    tokenEndpoint: discovery.metadata.token_endpoint,
    clientId: client.client_id,
    resource: discovery.resourceMetadata?.resource ?? destination.url.toString(),
    ...(scope ? { scope } : {}),
    tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? "none",
  };
  const content = {
    type: "mcp-http" as const, name: input.name, url: destination.url.toString(), transport: input.transport,
    authType: "oauth" as const, allowedToolNames: [] as string[],
    ...(input.sourceId ? { registryServerId: input.sourceId } : {}),
    ...(input.serverTitle ? { serverTitle: input.serverTitle } : {}),
    oauth,
  };
  const snapshot: FlowSnapshot = {
    v: 1,
    content: content as unknown as Record<string, unknown>,
    discovery: {
      issuer: discovery.issuer,
      authorizationServerUrl: discovery.info.authorizationServerUrl,
      authorizationServerMetadata: discovery.metadata,
      ...(discovery.resourceMetadata ? { resourceMetadata: discovery.resourceMetadata } : {}),
      ...(discovery.resourceMetadataUrl ? { resourceMetadataUrl: discovery.resourceMetadataUrl } : {}),
      resource: discovery.resourceMetadata?.resource ?? destination.url.toString(),
    },
  };
  const { error } = await supabase.from("mcp_oauth_flows").insert({
    flow_id: flowId, state_hash: createHash("sha256").update(state).digest("hex"),
    owner_user_id: input.ownerId, environment_ref: input.environmentRef, connection_ref: input.ref,
    connection_version: input.version, payload: snapshot, code_verifier: provider.verifier,
    client_id: client.client_id, client_secret: client.client_secret ?? null,
    token_endpoint: discovery.metadata.token_endpoint, authorization_endpoint: discovery.metadata.authorization_endpoint,
    resource: discovery.resourceMetadata?.resource ?? destination.url.toString(), redirect_uri: callback, return_to: legalReturnTo(input.returnTo),
    expires_at: new Date(Date.now() + FLOW_TTL_MS).toISOString(),
  });
  if (error) throw new ApiError(503, "MCP_OAUTH_UNAVAILABLE", "OAuth 授权流程暂时不可用");
  return { authorizationUrl: provider.authorizationUrlValue.toString(), callbackUrl: callback };
}

async function claimFlow(supabase: SupabaseClient, state: string): Promise<FlowRow | null> {
  const { data, error } = await supabase.from("mcp_oauth_flows")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", createHash("sha256").update(state).digest("hex"))
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();
  if (error) throw new ApiError(503, "MCP_OAUTH_UNAVAILABLE", "OAuth 授权流程暂时不可用");
  return (data as FlowRow | null) ?? null;
}
async function scrubFlow(supabase: SupabaseClient, flow: FlowRow) {
  const placeholder = base64url(randomBytes(48));
  await supabase.from("mcp_oauth_flows").update({ code_verifier: placeholder, client_secret: null }).eq("flow_id", flow.flow_id);
}

export async function handleMcpOAuthCallback(request: VercelRequest, response: { setHeader(name: string, value: string): void; statusCode?: number; end(): void }, supabase = createServerSupabase()) {
  const query = request.query ?? {};
  const state = typeof query.state === "string" ? query.state : "";
  const code = typeof query.code === "string" ? query.code : "";
  const error = typeof query.error === "string" ? query.error.slice(0, 80) : "";
  let returnTo = "/works";
  let ref = "";
  let claimed: FlowRow | null = null;
  const redirect = (params: Record<string, string>) => {
    const target = new URL(returnTo, "https://eduflow.invalid");
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    response.statusCode = 302;
    response.setHeader("location", `${target.pathname}${target.search}`);
    response.setHeader("cache-control", "no-store");
    response.end();
  };
  try {
    if (!state) throw new ApiError(400, "MCP_OAUTH_STATE", "OAuth 回调缺少 state");
    await cleanupFlows(supabase);
    // Claim before any token exchange: concurrent or replayed callbacks can
    // never both exchange the same authorization code.
    claimed = await claimFlow(supabase, state);
    if (!claimed) throw new ApiError(400, "MCP_OAUTH_STATE", "OAuth 授权已过期或已使用，请重新发起连接");
    returnTo = legalReturnTo(claimed.return_to);
    ref = String(claimed.connection_ref);
    if (error) throw new ApiError(400, "MCP_OAUTH_DENIED", "OAuth 授权未完成");
    if (!code) throw new ApiError(400, "MCP_OAUTH_CODE", "OAuth 回调缺少授权码");
    const snapshot = flowSnapshot(claimed);
    const payload = flowContent(claimed);
    if (!snapshot || snapshot.v !== 1 || !payload || payload.type !== "mcp-http" || payload.authType !== "oauth" || typeof payload.url !== "string") {
      throw new ApiError(400, "MCP_OAUTH_STATE", "OAuth 授权内容无效");
    }
    const oauthMeta = payload.oauth as Record<string, unknown> | undefined;
    const saved = snapshot.discovery;
    const savedMetadata = saved.authorizationServerMetadata;
    // The callback exchanges the code only with the authorization server that
    // was verified when the flow started. A changed issuer, token endpoint or
    // resource is rejected before any client secret or code can be sent.
    if (!savedMetadata?.token_endpoint || !savedMetadata.authorization_endpoint) {
      throw new ApiError(400, "MCP_OAUTH_STATE", "OAuth 授权发现状态不完整");
    }
    if (normalizeIssuer(saved.issuer) !== normalizeIssuer(saved.authorizationServerUrl) ||
        normalizeIssuer(String(savedMetadata.issuer ?? saved.issuer)) !== normalizeIssuer(saved.issuer) ||
        normalizeIssuer(savedMetadata.token_endpoint) !== normalizeIssuer(String(claimed.token_endpoint)) ||
        normalizeIssuer(savedMetadata.authorization_endpoint) !== normalizeIssuer(String(claimed.authorization_endpoint)) ||
        saved.resource !== String(claimed.resource ?? "") ||
        normalizeIssuer(String(oauthMeta?.issuer ?? "")) !== normalizeIssuer(saved.issuer) ||
        normalizeIssuer(String(oauthMeta?.authorizationEndpoint ?? "")) !== normalizeIssuer(savedMetadata.authorization_endpoint) ||
        normalizeIssuer(String(oauthMeta?.tokenEndpoint ?? "")) !== normalizeIssuer(savedMetadata.token_endpoint) ||
        String(oauthMeta?.resource ?? "") !== saved.resource) {
      throw new ApiError(400, "MCP_OAUTH_STATE", "OAuth 授权服务器或资源在回调前发生变化，请重新发起连接");
    }
    const scope = typeof oauthMeta?.scope === "string" ? oauthMeta.scope : "";
    const provider = new FlowProvider({
      redirectUrl: claimed.redirect_uri, scope, flow: claimed, supabase, mode: "callback",
    });
    provider.discoveryValue = {
      authorizationServerUrl: saved.authorizationServerUrl,
      authorizationServerMetadata: savedMetadata,
      resourceMetadata: saved.resourceMetadata,
    };
    const result = await auth(provider, {
      serverUrl: payload.url,
      authorizationCode: code,
      scope: scope || undefined,
      fetchFn: safeOAuthFetch,
    });
    if (result !== "AUTHORIZED" || !provider.storedTokens?.access_token) throw new ApiError(400, "MCP_OAUTH_TOKEN", "OAuth 授权码换取令牌失败");
    const token = provider.storedTokens;
    const bundle = {
      v: 1,
      access_token: token.access_token,
      token_type: token.token_type ?? "Bearer",
      ...(token.refresh_token ? { refresh_token: token.refresh_token } : {}),
      ...(typeof token.expires_in === "number" && token.expires_in > 0 ? { expires_at: Date.now() + token.expires_in * 1000 } : {}),
      ...(token.scope ? { scope: token.scope } : {}),
      client_id: String(claimed.client_id),
      ...(claimed.client_secret ? { client_secret: String(claimed.client_secret) } : {}),
      token_endpoint: String(claimed.token_endpoint),
      token_endpoint_auth_method: typeof oauthMeta?.tokenEndpointAuthMethod === "string" ? oauthMeta.tokenEndpointAuthMethod : "none",
      ...(claimed.resource ? { resource: String(claimed.resource) } : {}),
      issuer: saved.issuer,
    };
    const credential = JSON.stringify(bundle);
    if (credential.length > MAX_SECRET_LENGTH) throw new ApiError(400, "MCP_OAUTH_TOKEN", "OAuth 令牌超出限制");
    const ownerId = String(claimed.owner_user_id);
    const environmentRef = String(claimed.environment_ref);
    const version = Number(claimed.connection_version);
    const content = { ...payload, allowedToolNames: [] as string[] };
    await workflowCompiler("/v1/extensions", {
      ownerId, environmentRef, action: "publish", kind: "connection", ref, version, content, credential,
    });
    let tools: { name?: string }[] | null = null;
    let testError = "";
    try {
      const tested = await workflowCompiler<{ tools?: { name?: string }[]; ok?: boolean; error?: { message?: string } }>("/v1/extensions", {
        ownerId, environmentRef, action: "test", kind: "connection", ref, version,
      });
      if (tested?.ok === false) testError = tested.error?.message ?? "工具发现失败";
      else tools = tested?.tools ?? [];
    } catch (reason) {
      testError = safeMessage(reason, "工具发现失败");
    }
    await scrubFlow(supabase, claimed);
    // Authorization never implies tool permission: the connection stays
    // "authorized, awaiting explicit scope selection" even when tools were found.
    redirect({
      mcpOAuth: "pending",
      ref,
      ...(tools?.length ? { tools: String(tools.length) } : {}),
      message: testError ? `已授权，但暂时无法读取工具：${testError}` : "已授权，请在连接配置中选择允许的工具",
    });
  } catch (reason) {
    if (claimed) await scrubFlow(supabase, claimed).catch(() => undefined);
    const message = reason instanceof ApiError ? reason.message : safeMessage(reason, "OAuth 连接失败");
    redirect({ mcpOAuth: "error", ...(ref ? { ref } : {}), message });
  }
}
