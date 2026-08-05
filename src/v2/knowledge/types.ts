export type KnowledgeNodeType =
  | "conceptual"
  | "procedural"
  | "representational"
  | "language"
  | "meta";

export type KnowledgeScope = "global" | "tenant" | "user";
export type KnowledgeNodeStatus = "active" | "deprecated" | "superseded";

export type KnowledgeProvenance = {
  sourceType: "global-catalog" | "tenant-source" | "course" | "material" | "manual" | "import";
  sourceId: string;
  sourceRevision?: string;
  discoveredAt?: string;
};

export type KnowledgeNode = {
  id: string;
  title: string;
  description: string;
  type: KnowledgeNodeType;
  masteryCriteria: string[];
  scope: KnowledgeScope;
  ownerId?: string;
  domainId?: string;
  clusterId?: string;
  provenance: KnowledgeProvenance[];
  currentRevisionId: string;
  status: KnowledgeNodeStatus;
  supersededBy?: string[];
  splitFrom?: string;
  mergedFrom?: string[];
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type KnowledgeNodeRevision = {
  id: string;
  nodeId: string;
  version: number;
  title: string;
  description: string;
  type: KnowledgeNodeType;
  masteryCriteria: string[];
  createdBy?: string;
  createdAt: string;
  previousRevisionId?: string;
  changeReason?: string;
};

export type KnowledgeDomain = {
  id: string;
  title: string;
  description?: string;
  color: string;
};

export type KnowledgeCluster = {
  id: string;
  domainId: string;
  title: string;
  description?: string;
};

export type KnowledgeRelationType = "prerequisite" | "enables" | "related";
export type KnowledgeRelation = KnowledgeRelationType;

type KnowledgeRelationBase = {
  id: string;
  source: string;
  target: string;
  reason?: string;
};

export type PrerequisiteKnowledgeRelation = KnowledgeRelationBase & {
  relation: "prerequisite";
  strength: "hard" | "soft";
};

export type AssociativeKnowledgeRelation = KnowledgeRelationBase & {
  relation: "enables" | "related";
  strength?: number;
};

export type KnowledgeEdge = PrerequisiteKnowledgeRelation | AssociativeKnowledgeRelation;

export type KnowledgeGraph = {
  domains: KnowledgeDomain[];
  clusters: KnowledgeCluster[];
  nodes: KnowledgeNode[];
  revisions: KnowledgeNodeRevision[];
  edges: KnowledgeEdge[];
};

export type KnowledgeMappingRelation = "equivalent" | "narrower-than" | "broader-than" | "related-to";

export type KnowledgeMapping = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: KnowledgeMappingRelation;
  confirmedBy?: string;
  confirmedAt?: string;
  suggestedConfidence?: number;
};

export type KnowledgePromotionTarget = "tenant" | "global";
export type KnowledgePromotionRequest = {
  id: string;
  sourceNodeId: string;
  targetScope: KnowledgePromotionTarget;
  targetOwnerId?: string;
  status: "proposed" | "approved" | "rejected";
  proposedBy: string;
  proposedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  selectedTargetNodeId?: string;
};

export type KnowledgeEvidence = {
  id: string;
  nodeId: string;
  nodeRevisionId?: string;
  type: string;
  label: string;
  refId?: string;
  createdAt?: string;
  alsoSupportsNodeIds?: string[];
};

export type MasteryOrigin = "direct" | "inherited-from-split" | "inherited-from-merge" | "inferred";
export type KnowledgeMastery = {
  nodeId: string;
  mastery: number;
  masteryOrigin: MasteryOrigin;
  sourceNodeId?: string;
  sourceNodeIds?: string[];
  confidence?: number;
  updatedAt?: string;
};

export type SimilarityAnalysisRequest = {
  id: string;
  sourceNodeId: string;
  requestedBy: string;
  requestedAt: string;
  userTriggered: true;
  targetScopes: Array<"global" | "tenant" | "user">;
};

export type SimilarKnowledgeCandidate = {
  nodeId: string;
  confidence: number;
  signals: Array<"title" | "description" | "relation-context" | "embedding">;
};

export type SimilarityDecision = {
  requestId: string;
  candidateNodeId: string;
  decidedBy: string;
  decidedAt: string;
  action: "mapping" | "merge" | "keep-independent";
  mappingRelation?: KnowledgeMappingRelation;
};

export type KnowledgeGraphLayout = Record<string, { x: number; y: number; z?: number }>;
