import { chooseMostDistinctUnusedColor } from "@/features/knowledge/domain/domainColors";
import type { DomainDiscoveryService } from "@/features/knowledge/domain/DomainDiscoveryService";

const AGENT_RUNTIME_PROPOSAL_NODE_IDS = ["RT01", "RT02", "RT03", "RT14", "RT15", "RT06"];

export const demoDomainDiscoveryService: DomainDiscoveryService = {
  discover(nodes, domains) {
    const suggestedNodeIds = nodes
      .filter((node) => node.status === "active" && AGENT_RUNTIME_PROPOSAL_NODE_IDS.includes(node.id))
      .map((node) => node.id);
    if (suggestedNodeIds.length < 3) return [];
    return [{
      id: "domain-proposal-agent-runtime",
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
