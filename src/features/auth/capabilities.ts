import type { MockSession } from "./types";

export function canManageKnowledgeDomains(session: (Pick<MockSession, "capabilities"> & Partial<Pick<MockSession, "role">>) | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.capabilities.includes("global-domain-admin")));
}

export function canLearn(session: MockSession | null | undefined) { return Boolean(session); }
export function canManageCourses(session: Pick<MockSession, "role" | "capabilities"> | null | undefined) {
  return Boolean(session && (session.role === "teacher" || session.role === "admin" || session.capabilities.includes("global-domain-admin")));
}
export function canDesignCourse(session: Pick<MockSession, "role" | "capabilities"> | null | undefined) {
  return Boolean(session && (session.role === "teacher" || session.role === "admin" || session.capabilities.includes("global-domain-admin")));
}

export function canUseCourseDesignFeatures(session: Pick<MockSession, "role" | "capabilities"> | null | undefined, experience: "learn" | "design") {
  return experience === "design" && canDesignCourse(session);
}
