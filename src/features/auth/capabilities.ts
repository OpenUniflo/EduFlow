import type { MockSession } from "./types";

export function canManageKnowledgeDomains(session: Pick<MockSession, "capabilities"> | null | undefined) {
  return Boolean(session?.capabilities.includes("global-domain-admin"));
}
