import type { KnowledgeEdge, KnowledgeNode, KnowledgeScope } from "./knowledge/types";

export type LearningStatus = "completed" | "learning" | "available" | "locked";
export type CurriculumGenerationMode = "auto" | "auto-fixed-count" | "follow-source" | "manual";

export type CourseCurriculum = {
  id: string;
  courseId: string;
  generationMode: CurriculumGenerationMode;
  requestedChapterCount?: number;
  sourceStructureId?: string;
};

export type CurriculumChapter = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  lessonIds: string[];
  order: number;
  color: string;
  progress: number;
  outcome: string;
};

export type CurriculumLesson = {
  id: string;
  courseId: string;
  chapterId: string;
  title: string;
  order: number;
};

export type CurriculumOutcome = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  kind: "learning-outcome" | "project";
  lessonId?: string;
  legacySourceNodeId?: string;
};

export type CurriculumCoverageRole = "introduce" | "reinforce" | "apply" | "assess";
export type CurriculumCoverage = {
  id: string;
  courseId: string;
  lessonId: string;
  nodeId: string;
  role: CurriculumCoverageRole;
};

export type PracticeCoverageRole = "practice" | "reinforce" | "assess";
export type PracticeCoverage = {
  id: string;
  practiceId: string;
  nodeId: string;
  role: PracticeCoverageRole;
};

export type CurriculumSequence = {
  id: string;
  courseId: string;
  sourceLessonId: string;
  targetLessonId: string;
};

export type CourseCurriculumContext = CurriculumCoverage & {
  lessonOrder: number;
  chapterId: string;
};

export type CoursePracticeContext = PracticeCoverage & {
  title: string;
  templateId: string;
};

/** Presentation-only projection derived from KnowledgeNode + curriculum data. */
export type CourseSkillTreeNode = {
  id: string;
  knowledge: KnowledgeNode;
  title: string;
  description: string;
  scope: KnowledgeScope;
  primaryCoverage: CourseCurriculumContext;
  curriculumContexts: CourseCurriculumContext[];
  practiceContexts: CoursePracticeContext[];
  lessonId: string;
  lesson: number;
  chapterId: string;
  coverageRoles: CurriculumCoverageRole[];
  materialIds: string[];
  practiceIds: string[];
  practiceTitle: string;
  status: LearningStatus;
  color: string;
};

/** Presentation chapter identity. Renderer geometry is added only by the course graph adapter. */
export type CourseChapterProjection = CurriculumChapter;
export type CourseSkillTreeEdge = KnowledgeEdge;
export type CourseChapterEdge = {
  id: string;
  source: string;
  target: string;
  primaryRelation: "prerequisite" | "enables" | "sequence";
  sourceKind: "knowledge" | "curriculum-sequence";
  prerequisiteCount: number;
  enablesCount: number;
  supportCount: number;
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
  table?: { headers: string[]; rows: string[][] };
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
  checks: Array<{ id: string; label: string; weight: number }>;
};

export type LearningProgress = {
  version: 2;
  completedPracticeIds: string[];
  recentMaterialPage: number;
  updatedAt: string;
};
