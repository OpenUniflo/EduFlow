import type { CourseMappingInput, GeneratedAssignmentCandidate } from "./types";
import type { AssignmentGenerationGroup } from "./schema";

export const COURSE_MAPPING_PROMPT_VERSION = "phase4.3-goal-mapping-v2";

export function implementationStepPrompt(input: CourseMappingInput) {
  const lessonById = new Map(input.runtime.lessons.map((lesson) => [lesson.id, lesson]));
  return {
    system: "Plan implementation milestones from the user's target outcome and only the supplied Course Knowledge. Return JSON only. Goal determines direction; existing Knowledge determines the allowed decomposition. Combine Knowledge that jointly supports one practical milestone. Each Step must describe one coherent learner-built artifact or verifiable implementation advance; do not create a catch-all Step that absorbs unrelated chapters merely to reduce the count. If many Knowledge IDs are proposed for one Step, split them unless every ID is directly needed for the same deliverable. Do not default to one Step per KnowledgeNode, do not invent concepts or IDs, and cover every supplied Knowledge ID at least once. Reuse a Knowledge ID only when a later integrated milestone genuinely needs it.",
    user: JSON.stringify({ schema: { steps: [{ stepKey: "temporary unique key", title: "implementation milestone", objective: "observable objective", knowledgeNodeIds: ["exact supplied ID"] }] }, targetOutcome: input.targetOutcome, course: input.runtime.course, chapters: input.runtime.chapters.map(({ id, title, outcome, order }) => ({ id, title, outcome, order })), lessons: input.runtime.lessons.map(({ id, chapterId, title, order }) => ({ id, chapterId, title, order })), knowledge: input.knowledgeNodes.map((node) => ({ id: node.id, title: node.title, description: node.description, masteryCriteria: node.masteryCriteria, curriculum: input.runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === node.id).map((coverage) => ({ lessonId: coverage.lessonId, lessonTitle: lessonById.get(coverage.lessonId)?.title, role: coverage.role, order: coverage.order })) })), knowledgePrerequisites: input.knowledgeEdges.filter((edge) => edge.relation === "prerequisite").map((edge) => ({ source: edge.source, target: edge.target, strength: edge.strength })) })
  };
}

export function assignmentGenerationPrompt(input: CourseMappingInput, groups: AssignmentGenerationGroup[]) {
  const lessonById = new Map(input.runtime.lessons.map((lesson) => [lesson.id, lesson]));
  const curriculumByNode = new Map(input.knowledgeNodes.map((node) => [node.id, input.runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === node.id).map((coverage) => ({ lessonId: coverage.lessonId, lessonTitle: lessonById.get(coverage.lessonId)?.title, role: coverage.role }))]));
  return {
    system: "Generate exactly one meaningful CourseAssignment for each supplied Implementation Step. Practice is evaluation terminology only; production uses CourseAssignment. Return JSON only. Copy each groupKey exactly and never invent Knowledge IDs or Workflow template IDs. The mode field must be exactly the JSON string 'instruction' or 'workflow'; no other value is valid. Use 'instruction' unless an available template genuinely fits. Make projectContribution explain how this milestone advances the target outcome. Do not output rationale, confidence, provider payload, or hidden reasoning.",
    user: JSON.stringify({ schema: { assignments: [{ groupKey: "copy exact groupKey", title: "string", description: "objective", requirements: ["string"], expectedOutput: "deliverable", acceptanceCriteria: ["string"], mode: "instruction", workflowTemplateId: "omit for instruction; required for workflow", estimatedMinutes: 30, projectContribution: "contribution to target outcome" }] }, allowedModes: ["instruction", "workflow"], targetOutcome: input.targetOutcome, groups, course: input.runtime.course, chapters: input.runtime.chapters.map(({ id, title, outcome }) => ({ id, title, outcome })), knowledge: input.knowledgeNodes.map((node) => ({ id: node.id, title: node.title, description: node.description, masteryCriteria: node.masteryCriteria, curriculum: curriculumByNode.get(node.id), sourceEvidence: node.provenance.filter((item) => item.courseId === input.runtime.course.id).flatMap((item) => item.sourceLocations ?? []) })), workflowTemplates: input.workflowTemplates })
  };
}

export function assignmentDependencyPrompt(assignments: GeneratedAssignmentCandidate[], input: CourseMappingInput, targetSemanticKeys: string[]) {
  return {
    system: "Classify only direct Assignment prerequisites. A dependency exists only when the downstream Assignment genuinely needs the upstream capability or deliverable. Knowledge edges are evidence, never mechanical copies. Omit transitive shortcuts. Return JSON only with no hidden reasoning.",
    user: JSON.stringify({ schema: { dependencies: [{ sourceSemanticKey: "upstream", targetSemanticKey: "downstream", strength: "hard|soft", rationale: "brief teaching/execution reason" }] }, instruction: "Return only incoming direct dependencies whose targetSemanticKey is in targetSemanticKeys.", targetSemanticKeys, assignments: assignments.map(({ semanticKey, title, description, expectedOutput, knowledgeNodeIds }) => ({ semanticKey, title, description, expectedOutput, knowledgeNodeIds })), knowledgePrerequisites: input.knowledgeEdges.filter((edge) => edge.relation === "prerequisite").map((edge) => ({ source: edge.source, target: edge.target, strength: edge.strength })) })
  };
}
