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

export type AssignmentMode = "instruction" | "workflow";
export type AssignmentCoverageRole = "practice" | "apply" | "assess";
export type AssignmentCoverage = {
  id: string;
  assignmentId: string;
  nodeId: string;
  role: AssignmentCoverageRole;
};

export type CourseAssignment = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  requirements: string[];
  expectedOutput: string;
  acceptanceCriteria: string[];
  mode: AssignmentMode;
  workflowTemplateId?: string;
  estimatedMinutes?: number;
  projectContribution?: string;
};

export type UserAssignmentStatus = "not-started" | "in-progress" | "completed";
export type UserAssignmentState = {
  assignmentId: string;
  status: UserAssignmentStatus;
  progress?: number;
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

export type AssignmentContext = AssignmentCoverage & {
  assignment: CourseAssignment;
  state?: UserAssignmentState;
};

export type AssignmentStateSummary = {
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  progress: number;
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
  assignmentContexts: AssignmentContext[];
  assignmentCount: number;
  assignmentStateSummary: AssignmentStateSummary;
  lessonId: string;
  lesson: number;
  chapterId: string;
  coverageRoles: CurriculumCoverageRole[];
  materialIds: string[];
  assignmentIds: string[];
  status: LearningStatus;
  color: string;
};

/** Presentation chapter identity. Renderer geometry is added only by the course graph adapter. */
export type ChapterAssignmentSummary = {
  chapterId: string;
  assignmentIds: string[];
  assignmentCount: number;
  completedCount: number;
  inProgressCount: number;
  progress: number;
  outcome?: string;
};

export type CourseAssignmentSummary = {
  courseId: string;
  assignmentIds: string[];
  assignmentCount: number;
  completedCount: number;
  inProgressCount: number;
  progress: number;
};

export type CourseChapterProjection = CurriculumChapter & {
  assignmentSummary: ChapterAssignmentSummary;
};
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
  assignmentId?: string;
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
  version: 3;
  completedAssignmentIds: string[];
  recentMaterialPage: number;
  updatedAt: string;
};
