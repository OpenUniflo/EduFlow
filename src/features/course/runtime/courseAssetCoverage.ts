import type { CourseRuntimeData } from "./courseRuntime";

export type CourseKnowledgeAssetCoverage = {
  totalKnowledgeCount: number;
  coveredKnowledgeCount: number;
  missingKnowledgeCount: number;
  coveredKnowledgeNodeIds: string[];
  missingKnowledgeNodeIds: string[];
};

export type CourseAssetCoverageIssue = {
  code:
    | "missing-assignment-coverage"
    | "missing-material-coverage"
    | "micro-coverage-unavailable"
    | "missing-chapter-outcome"
    | "missing-final-project";
  severity: "warning" | "information";
  message: string;
};

export type CourseAssetCoverageAudit = {
  courseId: string;
  knowledgeCount: number;
  assignments: CourseKnowledgeAssetCoverage;
  materials: CourseKnowledgeAssetCoverage;
  micro: {
    status: "unavailable";
    coveredKnowledgeCount: null;
    missingKnowledgeCount: null;
    reason: string;
  };
  chapterOutcomes: {
    totalChapterCount: number;
    coveredChapterCount: number;
    missingChapterCount: number;
    missingChapterIds: string[];
  };
  finalProjects: {
    count: number;
    missing: boolean;
  };
  issues: CourseAssetCoverageIssue[];
};

export function courseAssetCoverageLabel(audit: CourseAssetCoverageAudit) {
  return audit.issues.some((issue) => issue.severity === "warning")
    ? "学习资产待补充"
    : "已配置学习资产";
}

function knowledgeCoverage(courseKnowledgeNodeIds: readonly string[], coveredNodeIds: ReadonlySet<string>): CourseKnowledgeAssetCoverage {
  const coveredKnowledgeNodeIds = courseKnowledgeNodeIds.filter((nodeId) => coveredNodeIds.has(nodeId));
  const missingKnowledgeNodeIds = courseKnowledgeNodeIds.filter((nodeId) => !coveredNodeIds.has(nodeId));
  return {
    totalKnowledgeCount: courseKnowledgeNodeIds.length,
    coveredKnowledgeCount: coveredKnowledgeNodeIds.length,
    missingKnowledgeCount: missingKnowledgeNodeIds.length,
    coveredKnowledgeNodeIds,
    missingKnowledgeNodeIds
  };
}

export function auditCourseAssetCoverage(runtime: CourseRuntimeData): CourseAssetCoverageAudit {
  const courseKnowledgeNodeIds = Array.from(new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId))).sort();
  const assignments = knowledgeCoverage(courseKnowledgeNodeIds, new Set(runtime.assignmentCoverages.map((coverage) => coverage.nodeId)));
  const materials = knowledgeCoverage(courseKnowledgeNodeIds, new Set(runtime.materialKnowledgeCoverages.map((coverage) => coverage.nodeId)));
  const outcomeChapterIds = new Set(runtime.chapterOutcomes.map((outcome) => outcome.chapterId));
  const missingChapterIds = runtime.chapters.map((chapter) => chapter.id).filter((chapterId) => !outcomeChapterIds.has(chapterId)).sort();
  const issues: CourseAssetCoverageIssue[] = [];

  if (assignments.missingKnowledgeCount) issues.push({
    code: "missing-assignment-coverage",
    severity: "warning",
    message: `${assignments.missingKnowledgeCount} Course KnowledgeNode(s) have no AssignmentCoverage`
  });
  if (materials.missingKnowledgeCount) issues.push({
    code: "missing-material-coverage",
    severity: "warning",
    message: `${materials.missingKnowledgeCount} Course KnowledgeNode(s) have no MaterialKnowledgeCoverage`
  });
  issues.push({
    code: "micro-coverage-unavailable",
    severity: "information",
    message: "Micro coverage is not represented by CourseRuntimeData and must be audited through the Micro boundary"
  });
  if (missingChapterIds.length) issues.push({
    code: "missing-chapter-outcome",
    severity: "warning",
    message: `${missingChapterIds.length} Chapter(s) have no ChapterOutcome`
  });
  if (!runtime.finalProjects.length) issues.push({
    code: "missing-final-project",
    severity: "warning",
    message: "Course has no FinalProject"
  });

  return {
    courseId: runtime.course.id,
    knowledgeCount: courseKnowledgeNodeIds.length,
    assignments,
    materials,
    micro: {
      status: "unavailable",
      coveredKnowledgeCount: null,
      missingKnowledgeCount: null,
      reason: "CourseRuntimeData has no Micro ownership or coverage relation"
    },
    chapterOutcomes: {
      totalChapterCount: runtime.chapters.length,
      coveredChapterCount: runtime.chapters.length - missingChapterIds.length,
      missingChapterCount: missingChapterIds.length,
      missingChapterIds
    },
    finalProjects: {
      count: runtime.finalProjects.length,
      missing: runtime.finalProjects.length === 0
    },
    issues
  };
}
