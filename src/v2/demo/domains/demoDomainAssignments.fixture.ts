import type { DomainAssignment } from "../../knowledge/domain/domainTypes";
import type { KnowledgeNode } from "../../knowledge/types";
import { agenticAiNodes } from "../../knowledge/seeds/agenticAiNodes";
import { pythonEngineeringNodes } from "../../knowledge/seeds/pythonEngineeringNodes";

export const DEMO_DOMAIN_ASSIGNMENT_TIME = "2026-08-08T00:00:00.000Z";

function assignmentsForActiveNodes(nodes: KnowledgeNode[], domainId: string, pinnedId: string, excludedNodeIds: string[] = []): DomainAssignment[] {
  const excluded = new Set(excludedNodeIds);
  return nodes.filter((node) => node.status === "active" && !excluded.has(node.id)).map((node) => ({
    nodeId: node.id,
    domainId,
    source: node.id === pinnedId ? "admin" : "auto",
    confidence: node.id === pinnedId ? undefined : 0.92,
    pinned: node.id === pinnedId,
    assignedBy: node.id === pinnedId ? "global-admin-demo" : undefined,
    assignedAt: DEMO_DOMAIN_ASSIGNMENT_TIME
  }));
}

export const demoDomainAssignments: DomainAssignment[] = [
  ...assignmentsForActiveNodes(agenticAiNodes, "agentic-ai", "R03", ["BR01"]),
  ...assignmentsForActiveNodes(pythonEngineeringNodes, "python-engineering", "PY01"),
  {
    nodeId: "U-DEMO-01",
    domainId: "agentic-ai",
    source: "auto",
    confidence: 0.92,
    pinned: false,
    assignedAt: DEMO_DOMAIN_ASSIGNMENT_TIME
  }
];
