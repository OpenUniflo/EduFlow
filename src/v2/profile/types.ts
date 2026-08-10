import type { AssignmentCoverageRole, CurriculumCoverageRole, UserAssignmentStatus } from "../types";
import type { KnowledgeEdge, KnowledgeEvidence, KnowledgeScope, MasteryOrigin } from "../knowledge/types";
import type { KnowledgeMaterialEntry } from "../material/materialNavigation";

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
  coverageOrder: number;
  chapterId: string;
  role: CurriculumCoverageRole;
  materialIds: string[];
  materialEntries: KnowledgeMaterialEntry[];
};

export type PersonalAssignmentContext = {
  coverageId: string;
  courseId: string;
  assignmentId: string;
  assignmentOrder: number;
  title: string;
  role: AssignmentCoverageRole;
  workflowTemplateId?: string;
  status: UserAssignmentStatus;
};

export type PersonalKnowledgeNode = {
  id: string;
  title: string;
  description: string;
  scope: KnowledgeScope;
  domainId?: string;
  domainTitle?: string;
  status: PersonalKnowledgeStatus;
  progress: number;
  isCore: boolean;
  curriculumContexts: CurriculumContext[];
  assignmentContexts: PersonalAssignmentContext[];
  evidence: string[];
};

export type PersonalKnowledgeEdge = KnowledgeEdge & {
  effective: boolean;
};

export type PersonalKnowledgeSummary = {
  mastered: number;
  learning: number;
  explore: number;
  completedAssignments: number;
  crossDomainConnections: number;
  connectivity: number;
  currentLearningId: string | null;
};

export type PersonalKnowledgeGraph = {
  nodes: PersonalKnowledgeNode[];
  edges: PersonalKnowledgeEdge[];
  summary: PersonalKnowledgeSummary;
};
