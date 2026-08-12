import type { MockSession } from "./types";

export const sessionStorageKey = "knowledge-atlas.mock-session.v2";

export function readMockSession(): MockSession | null {
  try {
    const raw = window.localStorage.getItem(sessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockSession;
    if (!parsed?.email) return null;
    return {
      ...parsed,
      capabilities: parsed.capabilities ?? (parsed.email.endsWith("@knowledge-atlas.local") ? ["global-domain-admin"] : [])
    };
  } catch {
    return null;
  }
}

export function writeMockSession(session: MockSession) {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function clearMockSession() {
  window.localStorage.removeItem(sessionStorageKey);
}
