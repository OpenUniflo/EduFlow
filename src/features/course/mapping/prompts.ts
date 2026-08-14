import type { CourseMappingInput, GeneratedAssignmentCandidate } from "./types";
import type { AssignmentGenerationGroup } from "./schema";

export const COURSE_MAPPING_PROMPT_VERSION = "phase4.3-mapping-v1";

export function assignmentGenerationPrompt(input: CourseMappingInput, groups: AssignmentGenerationGroup[]) {
  const lessonById = new Map(input.runtime.lessons.map((lesson) => [lesson.id, lesson]));
  const curriculumByNode = new Map(input.knowledgeNodes.map((node) => [node.id, input.runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === node.id).map((coverage) => ({ lessonId: coverage.lessonId, lessonTitle: lessonById.get(coverage.lessonId)?.title, role: coverage.role }))]));
  return {
    system: "Generate meaningful course Assignments. Practice is evaluation terminology only; production uses CourseAssignment. Return JSON only. Every supplied stable Knowledge ID must be covered. Support integrated and multiple assignments where pedagogically justified. Never invent Knowledge IDs or Workflow template IDs. Use instruction unless an available template genuinely fits. Do not output rationale, confidence, provider payload, or hidden reasoning.",
    user: JSON.stringify({ schema: { assignments: [{ groupKey: "copy exact groupKey", title: "string", description: "objective", requirements: ["string"], expectedOutput: "deliverable", acceptanceCriteria: ["string"], mode: "instruction|workflow", workflowTemplateId: "required only for workflow", estimatedMinutes: 30, projectContribution: "optional" }] }, groups, course: input.runtime.course, chapters: input.runtime.chapters.map(({ id, title, outcome }) => ({ id, title, outcome })), knowledge: input.knowledgeNodes.map((node) => ({ id: node.id, title: node.title, description: node.description, masteryCriteria: node.masteryCriteria, curriculum: curriculumByNode.get(node.id), sourceEvidence: node.provenance.filter((item) => item.courseId === input.runtime.course.id).flatMap((item) => item.sourceLocations ?? []) })), workflowTemplates: input.workflowTemplates })
  };
}

export function assignmentDependencyPrompt(assignments: GeneratedAssignmentCandidate[], input: CourseMappingInput, targetSemanticKeys: string[]) {
  return {
    system: "Classify only direct Assignment prerequisites. A dependency exists only when the downstream Assignment genuinely needs the upstream capability or deliverable. Knowledge edges are evidence, never mechanical copies. Omit transitive shortcuts. Return JSON only with no hidden reasoning.",
    user: JSON.stringify({ schema: { dependencies: [{ sourceSemanticKey: "upstream", targetSemanticKey: "downstream", strength: "hard|soft", rationale: "brief teaching/execution reason" }] }, instruction: "Return only incoming direct dependencies whose targetSemanticKey is in targetSemanticKeys.", targetSemanticKeys, assignments: assignments.map(({ semanticKey, title, description, expectedOutput, knowledgeNodeIds }) => ({ semanticKey, title, description, expectedOutput, knowledgeNodeIds })), knowledgePrerequisites: input.knowledgeEdges.filter((edge) => edge.relation === "prerequisite").map((edge) => ({ source: edge.source, target: edge.target, strength: edge.strength })) })
  };
}
