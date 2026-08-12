import type { DomainActor, DomainAssignment } from "./domainTypes";

export function createAdminDomainAssignment(nodeId: string, domainId: string, actor: DomainActor, assignedAt = new Date().toISOString()): DomainAssignment {
  return { nodeId, domainId, source: "admin", pinned: true, assignedBy: actor.id, assignedAt };
}

export function moveNodesToDomain(assignments: DomainAssignment[], nodeIds: string[], domainId: string, actor: DomainActor, assignedAt = new Date().toISOString()) {
  const moving = new Set(nodeIds);
  return [...assignments.filter((assignment) => !moving.has(assignment.nodeId)), ...nodeIds.map((nodeId) => createAdminDomainAssignment(nodeId, domainId, actor, assignedAt))];
}
