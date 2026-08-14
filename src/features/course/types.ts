import type { KnowledgeEdge, KnowledgeNode, KnowledgeScope } from "@/features/knowledge/types";

export type LearningStatus = "completed" | "learning" | "available" | "locked";
export type CurriculumGenerationMode = "auto" | "auto-fixed-count" | "follow-source" | "manual";

export type Course = {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  accentColor?: string;
  generationStatus?: "draft" | "parsed" | "curriculum-generated" | "ready";
};

export type CourseSummary = {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  status: "not-started" | "learning" | "completed";
  progress: number;
  chapterCount: number;
  lessonCount: number;
  knowledgeNodeCount: number;
  assignmentCount: number;
  recentLessonId?: string;
  recentMaterialId?: string;
  updatedAt?: string;
  accentColor?: string;
};

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
  order: number;
  color: string;
  outcome: string;
};

export type CurriculumLesson = {
  id: string;
  courseId: string;
  chapterId: string;
  title: string;
  order: number;
};

export type CurriculumCoverageRole = "introduce" | "reinforce" | "apply" | "assess";
export type CurriculumCoverage = {
  id: string;
  courseId: string;
  lessonId: string;
  nodeId: string;
  role: CurriculumCoverageRole;
  /** Deterministic instructional/display order inside this Lesson. */
  order: number;
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
  /** Stable course-wide instructional/display order. */
  order: number;
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

export type MaterialContext = {
  materialId: string;
  materialTitle: string;
  lessonId: string;
  segmentIds: string[];
  roles: MaterialKnowledgeCoverageRole[];
  primarySegmentId: string;
  primarySegmentTitle?: string;
  primarySegmentOrder: number;
  primaryRole: MaterialKnowledgeCoverageRole;
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
  materialContexts: MaterialContext[];
  assignmentIds: string[];
  status: LearningStatus;
  knowledgeProgress: number;
  hasKnowledgeEvidence: boolean;
  color: string;
};

/** Presentation chapter identity. Renderer geometry is added only by the course graph adapter. */
export type ChapterAssignmentSummary = {
  chapterId: string;
  assignmentIds: string[];
  assignmentCount: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
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
  lessonCount: number;
  knowledgeProgress: number;
  knowledgeEvidenceCount: number;
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

export type MaterialSegmentContent = {
  lead?: string;
  paragraphs?: string[];
  bullets?: string[];
  code?: string;
  table?: { headers: string[]; rows: string[][] };
  visual?: "overview" | "flow" | "comparison" | "trace" | "decision" | "practice" | string;
};

export type MaterialSegment = {
  id: string;
  order: number;
  page?: number;
  title?: string;
  section?: string;
  content?: MaterialSegmentContent;
};

export type MaterialSource = {
  kind: "pdf";
  url: string;
  pageCount: number;
};

export type Material = {
  id: string;
  courseId: string;
  lessonId: string;
  /** Stable instructional/display order inside the owning Lesson. */
  order: number;
  title: string;
  description?: string;
  type: "pdf" | "document" | "article";
  source?: MaterialSource;
  duration?: string;
  segments: MaterialSegment[];
};

export type MaterialKnowledgeCoverageRole = "introduce" | "explain" | "example" | "practice-reference";
export type MaterialKnowledgeCoverage = {
  id: string;
  materialId: string;
  segmentId: string;
  nodeId: string;
  role: MaterialKnowledgeCoverageRole;
};

export type UserMaterialState = {
  materialId: string;
  recentSegmentId?: string;
  viewedSegmentIds?: string[];
  progress?: number;
  completedSegmentIds?: string[];
  updatedAt: string;
};

export type UserCourseState = {
  userId: string;
  courseId: string;
  assignmentStates: Record<string, UserAssignmentState>;
  materialStates: Record<string, UserMaterialState>;
  recentLessonId?: string;
  updatedAt: string;
};

export type WorkflowLaunchContext = {
  courseId: string;
  assignmentId: string;
  workflowTemplateId: string;
};
