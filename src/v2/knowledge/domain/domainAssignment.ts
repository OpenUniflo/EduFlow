import type { DomainAssignment } from "./domainTypes";

export function createAdminDomainAssignment(nodeId: string, domainId: string, assignedAt = new Date().toISOString()): DomainAssignment {
  return { nodeId, domainId, source: "admin", pinned: true, assignedBy: "global-admin-demo", assignedAt };
}

export function moveNodesToDomain(assignments: DomainAssignment[], nodeIds: string[], domainId: string, assignedAt = new Date().toISOString()) {
  const moving = new Set(nodeIds);
  return [...assignments.filter((assignment) => !moving.has(assignment.nodeId)), ...nodeIds.map((nodeId) => createAdminDomainAssignment(nodeId, domainId, assignedAt))];
}
