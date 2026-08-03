export type PersonalKnowledgeStatus = "mastered" | "learning" | "explore" | "gap";
export type PersonalKnowledgeViewMode = "knowledge" | "history" | "practice" | "connection";
export type PersonalKnowledgeEdgeKind = "dependency" | "practice" | "project" | "cross" | "potential";

export type PersonalKnowledgeNode = {
  id: string;
  title: string;
  description: string;
  status: PersonalKnowledgeStatus;
  progress: number;
  lesson: number;
  stageId: string;
  stageTitle: string;
  x: number;
  y: number;
  isCore: boolean;
  materialId?: string;
  practiceId?: string;
  practiceTitle: string;
  prerequisiteIds: string[];
  nextIds: string[];
  evidence: string[];
};

export type PersonalKnowledgeEdge = {
  source: string;
  target: string;
  kind: PersonalKnowledgeEdgeKind;
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

export type PersonalKnowledgeStage = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeCount: number;
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
  connectivity: number;
  dependencyConnections: number;
  practiceConnections: number;
  projectConnections: number;
  currentLearningId: string | null;
  exploreTargetId: string | null;
};

export type PersonalKnowledgeGraph = {
  nodes: PersonalKnowledgeNode[];
  edges: PersonalKnowledgeEdge[];
  practices: PersonalPracticeEvidence[];
  stages: PersonalKnowledgeStage[];
  summary: PersonalKnowledgeSummary;
};
