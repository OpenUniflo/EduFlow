import type { KnowledgeEvidence, KnowledgeRelation, KnowledgeScope, MasteryOrigin } from "../knowledge/types";

export type UserKnowledgeStatus = "mastered" | "learning";
export type PersonalKnowledgeStatus = UserKnowledgeStatus | "explore" | "gap";
export type PersonalKnowledgeViewMode = "knowledge" | "history" | "practice" | "connection";
export type PersonalKnowledgeEdgeKind = "dependency" | "practice" | "project" | "cross" | "potential";

export type UserKnowledgeEvidence = KnowledgeEvidence;

export type UserKnowledgeRecord = {
  nodeId: string;
  status: UserKnowledgeStatus;
  mastery?: number;
  masteryOrigin?: MasteryOrigin;
  sourceNodeId?: string;
  sourceNodeIds?: string[];
  updatedAt?: string;
  evidence?: UserKnowledgeEvidence[];
};

export type PersonalKnowledgeNode = {
  id: string;
  title: string;
  description: string;
  scope: KnowledgeScope;
  domainId: string;
  domainTitle: string;
  domainColor: string;
  clusterId?: string;
  clusterTitle: string;
  islandId: string | null;
  status: PersonalKnowledgeStatus;
  progress: number;
  x: number;
  y: number;
  isCore: boolean;
  isPotentialBridge: boolean;
  courseId?: string;
  lesson?: number;
  materialId?: string;
  practiceId?: string;
  practiceTitle?: string;
  prerequisiteIds: string[];
  nextIds: string[];
  evidence: string[];
};

export type PersonalKnowledgeEdge = {
  id: string;
  source: string;
  target: string;
  relation: KnowledgeRelation;
  kind: PersonalKnowledgeEdgeKind;
  effective: boolean;
  isPotential: boolean;
  isCrossIsland: boolean;
};

export type PersonalPracticeEvidence = {
  id: string;
  title: string;
  knowledgeId: string;
  templateId: string;
  completed: boolean;
  x: number;
  y: number;
};

export type PersonalKnowledgeIsland = {
  id: string;
  nodeIds: string[];
  domainIds: string[];
  title: string;
  size: number;
  learningCount: number;
  bounds: { x: number; y: number; width: number; height: number };
  contourPath: string;
  label: { x: number; y: number };
};

export type PotentialBridgeSuggestion = {
  nodeId: string;
  title: string;
  pathNodeIds: string[];
  missingNodeIds: string[];
  description: string;
};

export type PersonalKnowledgeSummary = {
  mastered: number;
  learning: number;
  verifiedPractices: number;
  projects: number;
  islandCount: number;
  largestIslandName: string;
  largestIslandSize: number;
  crossDomainConnections: number;
  crossIslandConnections: number;
  connectivity: number;
  dependencyConnections: number;
  practiceConnections: number;
  projectConnections: number;
  potentialBridgeCount: number;
  currentLearningId: string | null;
  exploreTargetId: string | null;
};

export type PersonalKnowledgeGraph = {
  nodes: PersonalKnowledgeNode[];
  edges: PersonalKnowledgeEdge[];
  practices: PersonalPracticeEvidence[];
  islands: PersonalKnowledgeIsland[];
  potentialBridges: PotentialBridgeSuggestion[];
  summary: PersonalKnowledgeSummary;
};
