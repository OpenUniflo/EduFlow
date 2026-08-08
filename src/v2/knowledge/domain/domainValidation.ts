import type { DomainAssignment, KnowledgeDomain } from "./domainTypes";

export function validateDomainAssignments(assignments: DomainAssignment[], domains: KnowledgeDomain[], nodeIds: string[]) {
  const domainIds = new Set(domains.map((domain) => domain.id));
  const validNodeIds = new Set(nodeIds);
  const seen = new Set<string>();
  const errors: string[] = [];
  assignments.forEach((assignment) => {
    if (seen.has(assignment.nodeId)) errors.push(`Multiple primary Domains for ${assignment.nodeId}`);
    seen.add(assignment.nodeId);
    if (!validNodeIds.has(assignment.nodeId)) errors.push(`Unknown DomainAssignment node ${assignment.nodeId}`);
    if (!domainIds.has(assignment.domainId)) errors.push(`Unknown Domain ${assignment.domainId}`);
    if (assignment.source === "admin" && !assignment.pinned) errors.push(`Admin assignment must be pinned: ${assignment.nodeId}`);
  });
  return errors;
}
