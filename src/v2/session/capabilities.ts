import type { MockSession } from "../../app/model";

export function canManageKnowledgeDomains(session: Pick<MockSession, "capabilities"> | null | undefined) {
  return Boolean(session?.capabilities.some((capability) => capability === "global-domain-admin" || capability === "tenant-domain-admin"));
}
