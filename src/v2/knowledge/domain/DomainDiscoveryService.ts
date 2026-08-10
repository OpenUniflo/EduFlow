import type { KnowledgeNode } from "../types";
import type { DomainProposal, KnowledgeDomain } from "./domainTypes";

export interface DomainDiscoveryService {
  discover(nodes: KnowledgeNode[], domains: KnowledgeDomain[]): DomainProposal[];
}
