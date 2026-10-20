import { supabaseClient } from "./supabaseClient";

type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown; diagnostics?: unknown } };

export class ApiRequestError extends Error {
  constructor(readonly code: string | undefined, message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiResponseError extends Error {
  constructor() {
    super("服务返回的响应格式不正确，请刷新后重试。");
    this.name = "ApiResponseError";
  }
}

export type ApiAuthenticationFailure = Readonly<{
  sessionUserId: string;
  method: string;
  path: string;
  resource?: string;
  op?: string;
  status: 401;
  code?: string;
  requestId?: string;
  occurredAt: number;
}>;
export const API_AUTHENTICATION_FAILURE_TTL_MS = 5 * 60 * 1000;
let authenticationFailure: ApiAuthenticationFailure | null = null;
const authenticationFailureListeners = new Set<(failure: ApiAuthenticationFailure) => void>();

/** Short-lived, tab-local metadata only. Feature drafts never enter this shared boundary. */
export function getApiAuthenticationFailure(): ApiAuthenticationFailure | null {
  if (authenticationFailure) {
    const age = Date.now() - authenticationFailure.occurredAt;
    if (age < 0 || age >= API_AUTHENTICATION_FAILURE_TTL_MS) authenticationFailure = null;
  }
  return authenticationFailure;
}
export function subscribeApiAuthenticationFailure(listener: (failure: ApiAuthenticationFailure) => void): () => void {
  authenticationFailureListeners.add(listener);
  return () => { authenticationFailureListeners.delete(listener); };
}

function safeIdentifier(value: unknown, maximum = 160): string | undefined {
  return typeof value === "string" && value.length <= maximum && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) ? value : undefined;
}
function notifyAuthenticationFailure(sessionUserId: string | undefined, path: string, init: RequestInit | undefined, error: ApiErrorBody["error"]) {
  if (!sessionUserId) return;
  let pathname = "", resource: string | undefined, op: string | undefined;
  try {
    const url = new URL(path, "http://api.invalid");
    pathname = url.pathname.slice(0, 1024);
    const identifier = (key: string) => { const values = url.searchParams.getAll(key); return values.length === 1 ? safeIdentifier(values[0], 64) : undefined; };
    resource = identifier("resource"); op = identifier("op");
  } catch { /* No raw URL or query is exported when parsing fails. */ }
  const method = (init?.method ?? "GET").toUpperCase();
  const details = error?.details && typeof error.details === "object" ? error.details : undefined;
  const failure = Object.freeze({
    sessionUserId, method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) ? method : "UNKNOWN",
    path: pathname, ...(resource ? { resource } : {}), ...(op ? { op } : {}), status: 401 as const,
    ...(safeIdentifier(error?.code) ? { code: safeIdentifier(error?.code) } : {}),
    ...(details && "requestId" in details && safeIdentifier(details.requestId) ? { requestId: safeIdentifier(details.requestId) } : {}),
    occurredAt: Date.now(),
  });
  authenticationFailure = failure;
  // Synchronous before signOut can unmount the current Feature. A bad subscriber
  // must not prevent other subscribers, real local sign-out, or the HTTP rejection.
  for (const listener of authenticationFailureListeners) {
    try { listener(failure); } catch { /* Subscriber failures are isolated. */ }
  }
}

let expiredSessionSignOut: { token: string; pending: Promise<void> } | undefined;

async function clearExpiredLocalSession(token: string) {
  if (expiredSessionSignOut?.token !== token) {
    expiredSessionSignOut = { token, pending: supabaseClient.auth.signOut({ scope: "local" }).then(() => undefined) };
  }
  await expiredSessionSignOut.pending;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  const failureAtStart = getApiAuthenticationFailure();
  const alreadyExpiring = Boolean(token && expiredSessionSignOut?.token === token);
  if (!token || (expiredSessionSignOut && expiredSessionSignOut.token !== token)) expiredSessionSignOut = undefined;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  let body: T & ApiErrorBody;
  try { body = await response.json() as T & ApiErrorBody; }
  catch {
    // A successful but unreadable submission response cannot establish whether
    // a write happened. Keep this distinct from a definitive HTTP rejection.
    if (response.ok) throw new ApiResponseError();
    body = {} as T & ApiErrorBody;
  }
  if (!response.ok) {
    const error = body && typeof body === "object" ? body.error : undefined;
    if (response.status === 401 && token) {
      // A request from an older session must not invalidate a normal re-login
      // which completed while it was in flight. This SDK read stays in RAM.
      let currentSessionMatches = false;
      try { currentSessionMatches = (await supabaseClient.auth.getSession()).data.session?.access_token === token; }
      catch { /* Unconfirmed current identity cannot authorize clearing a newer session. */ }
      if (currentSessionMatches) {
        notifyAuthenticationFailure(data.session?.user?.id, path, init, error);
        await clearExpiredLocalSession(token);
      }
    }
    throw new ApiRequestError(error?.code, error?.message ?? `API request failed (${response.status})`, response.status, error?.diagnostics ? { ...(error.details && typeof error.details === "object" ? error.details : {}), diagnostics: error.diagnostics } : error?.details);
  }
  if (token && !alreadyExpiring && authenticationFailure === failureAtStart) authenticationFailure = null;
  return body;
}
