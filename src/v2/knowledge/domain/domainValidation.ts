import type { DomainAssignment, KnowledgeDomain } from "./domainTypes";
import type { KnowledgeNode } from "../types";

export function getDomainMembers(nodes: KnowledgeNode[], assignments: DomainAssignment[], selectedDomainId: string, query = "") {
  const assignmentByNode = new Map(assignments.map((assignment) => [assignment.nodeId, assignment]));
  const needle = query.trim().toLowerCase();
  return nodes.filter((node) => node.status === "active")
    .filter((node) => selectedDomainId ? assignmentByNode.get(node.id)?.domainId === selectedDomainId : !assignmentByNode.has(node.id))
    .filter((node) => !needle || `${node.title} ${node.description}`.toLowerCase().includes(needle));
}

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

export function assertDomainCanArchive(domainId: string, assignments: DomainAssignment[]) {
  const memberCount = assignments.filter((assignment) => assignment.domainId === domainId).length;
  if (memberCount) throw new Error(`该领域仍包含 ${memberCount} 个知识节点。请先迁移成员后再归档。`);
}

export function assertDomainAcceptsAssignment(domain: KnowledgeDomain) {
  if (domain.status !== "active") throw new Error(`Archived Domain ${domain.id} cannot accept assignments`);
}
