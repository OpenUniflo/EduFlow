/**
 * Cross-window plumbing for MCP OAuth.
 *
 * The authorization page is opened in a separate window/tab. The provider then
 * redirects that window back to EduFlow, which announces the server-validated
 * result on same-origin channels. The channel is only a wake-up signal; the
 * marketplace always re-reads the connection from the server before it treats
 * the authorization as complete.
 *
 * COOP must not be weakened: provider pages may sever `window.opener`, so this
 * module never relies on it. BroadcastChannel and the native `storage` event
 * keep working for same-origin top-level windows.
 */

export const MCP_OAUTH_FLOW_PARAM = "oauthFlow";
export const MCP_OAUTH_POPUP_PARAM = "mcpOAuthPopup";

const CHANNEL_NAME = "eduflow:mcp-oauth";
const STORAGE_PREFIX = "eduflow:mcp-oauth:";
const RESULT_KEYS = ["mcpOAuth", "ref", "tools", "message", MCP_OAUTH_FLOW_PARAM, MCP_OAUTH_POPUP_PARAM] as const;
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

/**
 * Windows that have been sent to the provider. Once a window leaves EduFlow it
 * is cross-origin, and with `opener` isolation enabled Chrome treats a script
 * close as an unsafe cross-origin navigation: it logs a console error and
 * leaves the window open. Such windows are the user's to close; only the blank
 * window that EduFlow still owns is script-closable.
 */
const providerWindows = new WeakSet<Window>();

export type McpOAuthResultStatus = "pending" | "error";

export type McpOAuthWindowResult = {
  status: McpOAuthResultStatus;
  /** Client-generated correlation id; also persisted in the server flow's returnTo. */
  flowId: string;
  ref: string;
  tools: number | null;
  message: string;
  /** True when this result belongs to an authorization window return page. */
  popup: boolean;
};

export type McpOAuthNotification = Omit<McpOAuthWindowResult, "popup"> & {
  id: string;
  at: number;
};

function bounded(value: string | null | undefined, length: number): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, length);
}

function randomId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** Correlation id for one authorization attempt; it is not a credential. */
export function createMcpOAuthFlowId(): string {
  return randomId();
}

/** Adds the correlation marker without dropping the page/search the user came from. */
export function withMcpOAuthReturnTo(returnTo: string, flowId: string, popup: boolean): string {
  const url = new URL(returnTo || "/", "https://eduflow.invalid");
  url.searchParams.set(MCP_OAUTH_FLOW_PARAM, flowId);
  if (popup) url.searchParams.set(MCP_OAUTH_POPUP_PARAM, "1");
  else url.searchParams.delete(MCP_OAUTH_POPUP_PARAM);
  const composed = `${url.pathname}${url.search}`;
  // The server caps returnTo at 500 characters. A popup does not need the
  // original page path, so fall back to a short path rather than losing the
  // correlation marker and turning the popup into a normal full-page result.
  if (popup && composed.length > 480) {
    const short = new URL("/", "https://eduflow.invalid");
    short.searchParams.set(MCP_OAUTH_FLOW_PARAM, flowId);
    short.searchParams.set(MCP_OAUTH_POPUP_PARAM, "1");
    return `${short.pathname}${short.search}`;
  }
  return composed;
}

function parseTools(value: string | null): number | null {
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Reads the query the callback redirected back to; it never reads or returns credentials. */
export function readMcpOAuthWindowResult(search: string): McpOAuthWindowResult | null {
  const params = new URLSearchParams(search);
  const status = params.get("mcpOAuth");
  if (status !== "pending" && status !== "error") return null;
  const flowId = bounded(params.get(MCP_OAUTH_FLOW_PARAM), 80);
  return {
    status,
    flowId: FLOW_ID_PATTERN.test(flowId) ? flowId : "",
    ref: bounded(params.get("ref"), 80),
    tools: parseTools(params.get("tools")),
    message: bounded(params.get("message"), 300),
    popup: params.get(MCP_OAUTH_POPUP_PARAM) === "1",
  };
}

/** Removes only the OAuth result markers, preserving unrelated query parameters. */
export function cleanMcpOAuthSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of RESULT_KEYS) params.delete(key);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function isMcpOAuthPopupReturn(search: string): boolean {
  return readMcpOAuthWindowResult(search)?.popup === true;
}

/** Opens the blank window synchronously from the click handler, before any network await. */
export function openMcpOAuthWindow(): Window | null {
  if (typeof window === "undefined" || typeof window.open !== "function") return null;
  let popup: Window | null = null;
  try {
    // Deliberately `_blank`: a fixed window name would reuse and overwrite the
    // authorization window when two marketplace pages start OAuth in the same
    // browser. Every attempt gets its own window and its own flow correlation.
    popup = window.open("about:blank", "_blank", "popup=yes,width=520,height=720");
  } catch {
    return null;
  }
  if (!popup) return null;
  // The provider page never needs (and must not get) a reverse-tabnabbing
  // handle. Keeping the WindowProxy here is enough to navigate and inspect it.
  try { popup.opener = null; } catch { /* Some engines already sever it. */ }
  try {
    popup.document.title = "EduFlow · 正在打开授权";
    popup.document.body.textContent = "正在打开服务方授权窗口，请稍候…";
    popup.document.body.style.cssText = "margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;font:14px/1.6 system-ui,-apple-system,sans-serif;color:#334155;background:#f7f8fa;text-align:center";
  } catch { /* The blank document may be unavailable; navigation still works. */ }
  try { popup.focus(); } catch { /* Mobile browsers may ignore focus. */ }
  return popup;
}

/** Navigates the already-open window. Only the server-provided http(s) URL is accepted. */
export function navigateMcpOAuthWindow(popup: Window | null, authorizationUrl: string): boolean {
  if (!popup || popup.closed || providerWindows.has(popup)) return false;
  try {
    const parsed = new URL(authorizationUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    popup.location.href = parsed.toString();
    providerWindows.add(popup);
    return true;
  } catch {
    return false;
  }
}

/** Shows a failure in a window that has not navigated away yet, then closes it if allowed. */
export function failMcpOAuthWindow(popup: Window | null, message: string): void {
  if (!popup || popup.closed) return;
  try {
    popup.document.body.textContent = message;
  } catch { /* Cross-origin or already navigated: leave it alone. */ }
  closeMcpOAuthWindow(popup);
}

export function closeMcpOAuthWindow(popup: Window | null): void {
  if (!popup) return;
  try {
    if (popup.closed) return;
  } catch { return; }
  // Do not attempt a cross-origin close. Besides being refused, Chrome reports
  // it as "Unsafe attempt to initiate navigation for frame with origin …" and
  // the provider window stays open anyway. Reading `location` on a cross-origin
  // proxy throws safely; only a callback that returned to EduFlow is closable.
  if (providerWindows.has(popup)) {
    try {
      if (popup.location.origin !== window.location.origin) return;
    } catch { return; }
  }
  try { popup.close(); } catch { /* A browser may refuse to close a tab. */ }
}

/**
 * Closes the window that rendered the callback. Only a same-origin top can be
 * closed from here: when a provider embeds the callback in an iframe, trying to
 * close the provider-origin top is refused and logged as an unsafe navigation.
 * The callback window itself may still close; otherwise the user closes it.
 */
export function closeCurrentOAuthWindow(): void {
  if (typeof window === "undefined") return;
  try { window.close(); } catch { /* not script-closable */ }
  try {
    const top = window.top;
    if (!top || top === window) return;
    if (top.location.origin !== window.location.origin) return;
    top.close();
  } catch { /* cross-origin top or not script-closable */ }
}

function parseNotification(value: unknown): McpOAuthNotification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id || record.id.length > 100) return null;
  if (record.status !== "pending" && record.status !== "error") return null;
  if (typeof record.flowId !== "string" || !FLOW_ID_PATTERN.test(record.flowId)) return null;
  if (typeof record.at !== "number" || !Number.isFinite(record.at)) return null;
  const tools = typeof record.tools === "number" && Number.isSafeInteger(record.tools) && record.tools >= 0 && record.tools <= 100000
    ? record.tools
    : null;
  // Rebuild rather than forwarding the received object: a compromised or noisy
  // sender must not be able to smuggle extra fields (for example credentials)
  // into another tab's application state.
  return {
    id: record.id,
    at: record.at,
    status: record.status,
    flowId: record.flowId,
    ref: bounded(typeof record.ref === "string" ? record.ref : "", 80),
    tools,
    message: bounded(typeof record.message === "string" ? record.message : "", 300),
  };
}

/**
 * Announces a callback result to same-origin EduFlow tabs. The payload carries
 * no token, secret, connection content or preview data.
 */
export function notifyMcpOAuthResult(result: McpOAuthWindowResult): McpOAuthNotification {
  const payload: McpOAuthNotification = {
    id: randomId(),
    at: Date.now(),
    status: result.status,
    flowId: result.flowId,
    ref: bounded(result.ref, 80),
    tools: result.tools,
    message: bounded(result.message, 300),
  };
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      globalThis.setTimeout(() => { try { channel.close(); } catch { /* already closed */ } }, 250);
    } catch { /* Fall through to the storage event. */ }
  }
  try {
    if (typeof localStorage !== "undefined") {
      const key = `${STORAGE_PREFIX}${payload.id}`;
      localStorage.setItem(key, JSON.stringify(payload));
      globalThis.setTimeout(() => { try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ } }, 2000);
    }
  } catch { /* Private mode or a disabled store: polling remains the fallback. */ }
  return payload;
}

/**
 * Subscribes for exactly one correlation id. Returns a synchronous cleanup that
 * removes both listeners and closes the channel.
 */
export function subscribeMcpOAuthResult(flowId: string, handler: (notification: McpOAuthNotification) => void): () => void {
  if (!FLOW_ID_PATTERN.test(flowId)) return () => undefined;
  const seen = new Set<string>();
  const accept = (value: unknown) => {
    const payload = parseNotification(value);
    if (!payload || payload.flowId !== flowId || seen.has(payload.id)) return;
    seen.add(payload.id);
    if (seen.size > 64) {
      const oldest = seen.values().next().value;
      if (oldest) seen.delete(oldest);
    }
    handler(payload);
  };
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", event => accept((event as MessageEvent).data));
    } catch { channel = null; }
  }
  const onStorage = (event: StorageEvent) => {
    if (!event.key?.startsWith(STORAGE_PREFIX) || !event.newValue) return;
    try { accept(JSON.parse(event.newValue)); } catch { /* ignore malformed cross-tab data */ }
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("storage", onStorage);
  return () => {
    if (channel) {
      try { channel.close(); } catch { /* already closed */ }
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") window.removeEventListener("storage", onStorage);
  };
}
