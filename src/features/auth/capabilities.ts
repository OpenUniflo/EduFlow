import type { MockSession } from "./types";

export function canManageKnowledgeDomains(session: Pick<MockSession, "capabilities"> | null | undefined) {
  return Boolean(session?.capabilities.includes("global-domain-admin"));
}

export function canLearn(session: MockSession | null | undefined) { return Boolean(session); }
export function canManageCourses(session: Pick<MockSession, "role" | "capabilities"> | null | undefined) {
  return Boolean(session && (session.role === "teacher" || session.role === "admin" || session.capabilities.includes("global-domain-admin")));
}
export function canDesignCourse(session: Pick<MockSession, "role" | "capabilities"> | null | undefined) {
  return Boolean(session && (session.role === "teacher" || session.role === "admin" || session.capabilities.includes("global-domain-admin")));
}
