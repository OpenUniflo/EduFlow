import type { AssignmentCoverage, AssignmentDependency, AssignmentOutcomeComposition, ChapterOutcome, CourseAssignment, FinalProject, FinalProjectOutcomeComposition } from "@/features/course/types";
import { selectPrimaryCurriculumCoverage } from "../curriculum/curriculumOrdering";
import type { CourseRuntimeData } from "../runtime/courseRuntime";
import { deterministicMappingId } from "./deterministicId";
import type { CourseMappingGeneration } from "./types";

export type CourseMappingPlan = {
  assignments: CourseAssignment[];
  assignmentCoverages: AssignmentCoverage[];
  assignmentDependencies: AssignmentDependency[];
  chapterOutcomes: ChapterOutcome[];
  assignmentOutcomeCompositions: AssignmentOutcomeComposition[];
  finalProjects: FinalProject[];
  finalProjectOutcomeCompositions: FinalProjectOutcomeComposition[];
  materialKnowledgeCoverages: CourseMappingGeneration["materialCoverage"]["coverages"];
  executions: CourseMappingGeneration["executions"];
};

export function buildCourseMappingPlan(runtime: CourseRuntimeData, generation: CourseMappingGeneration): CourseMappingPlan {
  const assignmentIdByKey = new Map(generation.assignments.map((candidate) => [candidate.semanticKey, deterministicMappingId("as", runtime.course.id, candidate.semanticKey, ...[...candidate.knowledgeNodeIds].sort())]));
  const assignments = generation.assignments.map((candidate, order): CourseAssignment => ({
    id: assignmentIdByKey.get(candidate.semanticKey) as string, courseId: runtime.course.id, order, title: candidate.title, description: candidate.description,
    requirements: candidate.requirements, expectedOutput: candidate.expectedOutput, acceptanceCriteria: candidate.acceptanceCriteria, mode: candidate.mode,
    ...(candidate.workflowTemplateId ? { workflowTemplateId: candidate.workflowTemplateId } : {}), ...(candidate.estimatedMinutes ? { estimatedMinutes: candidate.estimatedMinutes } : {}),
    ...(candidate.projectContribution ? { projectContribution: candidate.projectContribution } : {})
  }));
  const assignmentCoverages = generation.assignments.flatMap((candidate) => candidate.knowledgeNodeIds.map((nodeId): AssignmentCoverage => ({
    id: deterministicMappingId("ac", runtime.course.id, assignmentIdByKey.get(candidate.semanticKey) as string, nodeId), assignmentId: assignmentIdByKey.get(candidate.semanticKey) as string, nodeId, role: "practice"
  }))).sort((left, right) => left.assignmentId.localeCompare(right.assignmentId) || left.nodeId.localeCompare(right.nodeId));
  const assignmentDependencies = generation.dependencies.map((dependency): AssignmentDependency => {
    const sourceAssignmentId = assignmentIdByKey.get(dependency.sourceSemanticKey) as string;
    const targetAssignmentId = assignmentIdByKey.get(dependency.targetSemanticKey) as string;
    return { id: deterministicMappingId("ad", runtime.course.id, sourceAssignmentId, targetAssignmentId), courseId: runtime.course.id, sourceAssignmentId, targetAssignmentId, strength: dependency.strength };
  });
  const chapterOutcomes = runtime.chapters.map((chapter): ChapterOutcome => ({ id: deterministicMappingId("co", runtime.course.id, chapter.id), courseId: runtime.course.id, chapterId: chapter.id, title: chapter.outcome }));
  const outcomeByChapter = new Map(chapterOutcomes.map((outcome) => [outcome.chapterId, outcome]));
  const primaryChapterByNode = new Map(runtime.curriculumCoverages.map((coverage) => coverage.nodeId).map((nodeId) => {
    const primary = selectPrimaryCurriculumCoverage(runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === nodeId), runtime.lessons);
    return [nodeId, runtime.lessons.find((lesson) => lesson.id === primary?.lessonId)?.chapterId] as const;
  }));
  const candidateByKey = new Map(generation.assignments.map((candidate) => [candidate.semanticKey, candidate]));
  const downstreamChapterIdsByKey = new Map<string, Set<string>>();
  generation.dependencies.forEach((dependency) => {
    const chapters = candidateByKey.get(dependency.targetSemanticKey)?.knowledgeNodeIds.map((nodeId) => primaryChapterByNode.get(nodeId)).filter((id): id is string => Boolean(id)) ?? [];
    downstreamChapterIdsByKey.set(dependency.sourceSemanticKey, new Set([...(downstreamChapterIdsByKey.get(dependency.sourceSemanticKey) ?? []), ...chapters]));
  });
  const assignmentOutcomeCompositions = generation.assignments.flatMap((candidate) => Array.from(new Set([...candidate.knowledgeNodeIds.map((nodeId) => primaryChapterByNode.get(nodeId)).filter((id): id is string => Boolean(id)), ...(downstreamChapterIdsByKey.get(candidate.semanticKey) ?? [])])).map((chapterId): AssignmentOutcomeComposition => {
    const assignmentId = assignmentIdByKey.get(candidate.semanticKey) as string;
    const outcomeId = outcomeByChapter.get(chapterId)?.id as string;
    return { id: deterministicMappingId("aoc", runtime.course.id, assignmentId, outcomeId), assignmentId, outcomeId };
  }));
  const targetOutcome = runtime.course.targetOutcome?.trim();
  if (!targetOutcome) throw new Error("FinalProject composition requires Course.targetOutcome");
  const finalProject: FinalProject = { id: deterministicMappingId("fp", runtime.course.id), courseId: runtime.course.id, title: `${runtime.course.title} 最终项目`, description: `最终目标：${targetOutcome}。通过以下阶段成果完成：${chapterOutcomes.map((outcome) => outcome.title).join("；")}` };
  const finalProjectOutcomeCompositions = chapterOutcomes.map((outcome): FinalProjectOutcomeComposition => ({ id: deterministicMappingId("fpoc", runtime.course.id, finalProject.id, outcome.id), finalProjectId: finalProject.id, outcomeId: outcome.id }));
  return { assignments, assignmentCoverages, assignmentDependencies, chapterOutcomes, assignmentOutcomeCompositions, finalProjects: [finalProject], finalProjectOutcomeCompositions, materialKnowledgeCoverages: generation.materialCoverage.coverages, executions: generation.executions };
}
