export type KnowledgeRelation =
  | "prerequisite"
  | "implementation-support"
  | "conceptual"
  | "practice-support"
  | "related";

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

export type KnowledgeNode = {
  id: string;
  title: string;
  domainId: string;
  clusterId?: string;
  description: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type KnowledgeEdge = {
  id: string;
  source: string;
  target: string;
  relation: KnowledgeRelation;
  directed?: boolean;
  strength?: number;
  description?: string;
};

export type KnowledgeGraph = {
  domains: KnowledgeDomain[];
  clusters: KnowledgeCluster[];
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
};

export type KnowledgeGraphLayout = Record<string, { x: number; y: number; z?: number }>;
