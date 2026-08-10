import type { DomainAssignment, KnowledgeDomain } from "./domainTypes";
import type { KnowledgeGraph, KnowledgeNode } from "../types";
import type { DomainGovernanceState } from "./DomainGovernanceRepository";
import { isValidDomainColor } from "./domainColors";

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

export function validateDomainGovernance(graph: KnowledgeGraph, governance: DomainGovernanceState) {
  const errors: string[] = [];
  const activeNodeIds = new Set(graph.nodes.filter((node) => node.status === "active").map((node) => node.id));
  const domainIds = new Set<string>();
  const domainById = new Map<string, KnowledgeDomain>();
  governance.domains.forEach((domain) => {
    if (domainIds.has(domain.id)) errors.push(`Duplicate Domain ${domain.id}`);
    domainIds.add(domain.id);
    domainById.set(domain.id, domain);
    if (!isValidDomainColor(domain.canonicalColor)) errors.push(`Invalid Domain color ${domain.id}`);
  });
  errors.push(...validateDomainAssignments(governance.assignments, governance.domains, [...activeNodeIds]));
  governance.assignments.forEach((assignment) => {
    if (domainById.get(assignment.domainId)?.status === "archived") errors.push(`Archived Domain ${assignment.domainId} has active assignment ${assignment.nodeId}`);
  });
  governance.candidates.forEach((candidate) => {
    if (!activeNodeIds.has(candidate.nodeId)) errors.push(`Unknown DomainAssignmentCandidate node ${candidate.nodeId}`);
    if (domainById.get(candidate.domainId)?.status !== "active") errors.push(`Candidate references inactive Domain ${candidate.domainId}`);
  });
  const proposalIds = new Set<string>();
  governance.proposals.forEach((proposal) => {
    if (proposalIds.has(proposal.id)) errors.push(`Duplicate DomainProposal ${proposal.id}`);
    proposalIds.add(proposal.id);
    proposal.suggestedNodeIds.forEach((nodeId) => {
      if (!activeNodeIds.has(nodeId)) errors.push(`DomainProposal ${proposal.id} references unknown node ${nodeId}`);
    });
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
