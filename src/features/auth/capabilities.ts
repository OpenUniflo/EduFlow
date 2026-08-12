import type { MockSession } from "@/features/workflow/model";

export function canManageKnowledgeDomains(session: Pick<MockSession, "capabilities"> | null | undefined) {
  return Boolean(session?.capabilities.includes("global-domain-admin"));
}
