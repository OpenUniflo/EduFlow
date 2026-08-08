export type KnowledgeDomainScope = "global" | "tenant";

export type KnowledgeDomain = {
  id: string;
  scope: KnowledgeDomainScope;
  name: string;
  description?: string;
  canonicalColor: string;
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type DomainAssignment = {
  nodeId: string;
  domainId: string;
  source: "auto" | "admin";
  confidence?: number;
  pinned: boolean;
  assignedBy?: string;
  assignedAt: string;
};

export type DomainAssignmentCandidate = {
  nodeId: string;
  domainId: string;
  score: number;
  semanticScore: number;
  structuralScore: number;
  algorithmVersion: string;
  generatedAt: string;
};

export type DomainProposal = {
  id: string;
  scope: KnowledgeDomainScope;
  suggestedName: string;
  suggestedDescription?: string;
  suggestedColor: string;
  suggestedNodeIds: string[];
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  algorithmVersion: string;
  generatedAt: string;
};

export type DomainDiscoveryConfig = {
  semanticWeight: number;
  structuralWeight: number;
  autoAssignThreshold: number;
  suggestionThreshold: number;
  algorithmVersion: string;
};

export type DomainAdminCapability = "global-domain-admin" | "tenant-domain-admin";
