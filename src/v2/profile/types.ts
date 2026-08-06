import type { CurriculumCoverageRole, PracticeCoverageRole } from "../types";
import type { KnowledgeEdge, KnowledgeEvidence, KnowledgeScope, MasteryOrigin } from "../knowledge/types";

export type UserKnowledgeStatus = "mastered" | "learning";
export type PersonalKnowledgeStatus = UserKnowledgeStatus | "explore";
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

export type CurriculumContext = {
  coverageId: string;
  courseId: string;
  lessonId: string;
  lessonOrder: number;
  chapterId: string;
  role: CurriculumCoverageRole;
  materialIds: string[];
};

export type PracticeContext = {
  coverageId: string;
  practiceId: string;
  title: string;
  role: PracticeCoverageRole;
  templateId: string;
  completed: boolean;
};

export type PersonalKnowledgeNode = {
  id: string;
  title: string;
  description: string;
  scope: KnowledgeScope;
  domainId?: string;
  domainTitle?: string;
  domainColor?: string;
  status: PersonalKnowledgeStatus;
  progress: number;
  isCore: boolean;
  curriculumContexts: CurriculumContext[];
  practiceContexts: PracticeContext[];
  evidence: string[];
};

export type PersonalKnowledgeEdge = KnowledgeEdge & {
  effective: boolean;
};

export type PersonalKnowledgeSummary = {
  mastered: number;
  learning: number;
  explore: number;
  verifiedPractices: number;
  crossDomainConnections: number;
  connectivity: number;
  currentLearningId: string | null;
};

export type PersonalKnowledgeGraph = {
  nodes: PersonalKnowledgeNode[];
  edges: PersonalKnowledgeEdge[];
  summary: PersonalKnowledgeSummary;
};
