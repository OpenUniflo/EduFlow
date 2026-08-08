import type { KnowledgeNode } from "../types";
import { chooseMostDistinctUnusedColor } from "./domainColors";
import type { DomainProposal, KnowledgeDomain } from "./domainTypes";

export interface DomainDiscoveryService {
  discover(nodes: KnowledgeNode[], domains: KnowledgeDomain[]): DomainProposal[];
}

export const demoDomainDiscoveryService: DomainDiscoveryService = {
  discover(nodes, domains) {
    const suggestedNodeIds = nodes.filter((node) => node.status === "active" && ["RT01", "RT02", "RT03", "RT14", "RT15", "RT06"].includes(node.id)).map((node) => node.id);
    if (suggestedNodeIds.length < 3) return [];
    return [{
      id: "domain-proposal-agent-runtime",
      scope: "global",
      suggestedName: "Agent Runtime & Reliability",
      suggestedDescription: "智能体循环、状态机、运行边界、恢复、检查点与审计。",
      suggestedColor: chooseMostDistinctUnusedColor(domains.map((domain) => domain.canonicalColor)),
      suggestedNodeIds,
      confidence: 0.87,
      status: "pending",
      algorithmVersion: "deterministic-proposal-v1",
      generatedAt: "2026-08-08T00:00:00.000Z"
    }];
  }
};
