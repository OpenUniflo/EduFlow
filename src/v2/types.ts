export type LearningStatus = "completed" | "learning" | "available" | "locked";

export type CourseStage = {
  id: string;
  title: string;
  description: string;
  lessonIds: string[];
  color: string;
  x: number;
  y: number;
  progress: number;
  outcome: string;
};

export type CourseKnowledgeReference = {
  nodeId: string;
  lesson: number;
  stageId: string;
  prerequisiteNodeIds: string[];
  materialIds: string[];
  practiceId?: string;
  practiceTitle: string;
  status: LearningStatus;
  x: number;
  y: number;
};

export type KnowledgeNode = CourseKnowledgeReference & {
  id: string;
  title: string;
  description: string;
  prerequisites: string[];
  color: string;
  icon?: string;
};

export type Practice = {
  id: string;
  title: string;
  paradigm: string;
  description: string;
  templateId: string;
  acceptanceSpecId: string;
  estimatedMinutes: number;
};

export type MaterialPage = {
  id: string;
  number: number;
  section: string;
  title: string;
  lead: string;
  bullets?: string[];
  code?: string;
  knowledge: string[];
  knowledgeIds?: string[];
  primaryKnowledgeId?: string;
  visual?: "overview" | "flow" | "comparison" | "trace" | "decision" | "practice";
  practiceId?: string;
  table?: {
    headers: string[];
    rows: string[][];
  };
};

export type Material = {
  id: string;
  courseId: string;
  title: string;
  subtitle: string;
  duration: string;
  pageCount: number;
  pages: MaterialPage[];
};

export type AcceptanceSpec = {
  id: string;
  title: string;
  checks: Array<{
    id: string;
    label: string;
    weight: number;
  }>;
};

export type LearningProgress = {
  version: 2;
  completedPracticeIds: string[];
  recentMaterialPage: number;
  updatedAt: string;
};
