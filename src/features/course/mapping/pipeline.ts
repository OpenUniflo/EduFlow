import type { StructuredGenerationClient } from "@/features/knowledge/generation/types";
import { reduceAssignmentDependencies } from "./assignmentDag";
import { resolveMaterialCoverage } from "./materialCoverage";
import { assignmentDependencyPrompt, assignmentGenerationPrompt, COURSE_MAPPING_PROMPT_VERSION } from "./prompts";
import { parseGeneratedAssignmentGroups, parseGeneratedDependencies, type AssignmentGenerationGroup } from "./schema";
import type { CourseMappingGeneration, CourseMappingInput } from "./types";
import { selectPrimaryCurriculumCoverage } from "../curriculum/curriculumOrdering";
import { deterministicMappingId, normalizeMappingSemanticKey } from "./deterministicId";

async function boundedGenerate<T>(client: StructuredGenerationClient, request: Parameters<StructuredGenerationClient["generateJson"]>[0], parse: (value: unknown) => T) {
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await client.generateJson(correction ? { ...request, system: `${request.system}\nPrevious output failed validation: ${correction}. Return a complete corrected response and preserve every supplied stable ID.` } : request);
    try { return { value: parse(result.value), metadata: result.metadata }; }
    catch (error) {
      correction = error instanceof Error ? error.message : "structured output validation failed";
      if (attempt === 1) throw error;
    }
  }
  throw new Error("Structured course mapping generation exhausted retries");
}

export async function runCourseMappingPipeline(input: CourseMappingInput, client: StructuredGenerationClient): Promise<CourseMappingGeneration> {
  const courseNodeIds = new Set(input.runtime.curriculumCoverages.map((coverage) => coverage.nodeId));
  const activeNodes = input.knowledgeNodes.filter((node) => node.status === "active" && courseNodeIds.has(node.id));
  if (activeNodes.length !== courseNodeIds.size) throw new Error("Course mapping requires every curriculum KnowledgeNode to be active and visible");
  const scopedInput = { ...input, knowledgeNodes: activeNodes };
  const materialCoverage = resolveMaterialCoverage(input.runtime, activeNodes);
  if (materialCoverage.unresolved.length) throw new Error(`Material provenance resolution failed for ${materialCoverage.unresolved.length} source location(s)`);
  const chapterByLesson = new Map(input.runtime.lessons.map((lesson) => [lesson.id, lesson.chapterId]));
  const nodesByChapter = new Map<string, typeof activeNodes>();
  activeNodes.forEach((node) => {
    const primary = selectPrimaryCurriculumCoverage(input.runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === node.id), input.runtime.lessons);
    const chapterId = primary ? chapterByLesson.get(primary.lessonId) : undefined;
    if (!chapterId) throw new Error(`KnowledgeNode ${node.id} has no resolvable primary Chapter`);
    nodesByChapter.set(chapterId, [...(nodesByChapter.get(chapterId) ?? []), node]);
  });
  const assignmentResults = [];
  const chapterOrder = new Map(input.runtime.chapters.map((chapter) => [chapter.id, chapter.order]));
  const lessonOrder = new Map(input.runtime.lessons.map((lesson) => [lesson.id, lesson.order]));
  const nodeOrder = new Map(activeNodes.map((node) => {
    const coverage = selectPrimaryCurriculumCoverage(input.runtime.curriculumCoverages.filter((item) => item.nodeId === node.id), input.runtime.lessons);
    return [node.id, [(coverage ? lessonOrder.get(coverage.lessonId) : undefined) ?? Number.MAX_SAFE_INTEGER, coverage?.order ?? Number.MAX_SAFE_INTEGER]] as const;
  }));
  for (const [chapterId, chapterNodes] of Array.from(nodesByChapter).sort(([left], [right]) => (chapterOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (chapterOrder.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right))) {
    const chapterInput = { ...scopedInput, knowledgeNodes: chapterNodes };
    const individualGroups: AssignmentGenerationGroup[] = [...chapterNodes].sort((left, right) => (nodeOrder.get(left.id)?.[0] ?? 0) - (nodeOrder.get(right.id)?.[0] ?? 0) || (nodeOrder.get(left.id)?.[1] ?? 0) - (nodeOrder.get(right.id)?.[1] ?? 0) || left.id.localeCompare(right.id)).map((node, index) => ({ groupKey: `g${index + 1}`, identityKey: deterministicMappingId("node", node.id), knowledgeNodeIds: [node.id] }));
    const lessonGroups: AssignmentGenerationGroup[] = input.runtime.lessons.filter((lesson) => lesson.chapterId === chapterId).flatMap((lesson) => {
      const knowledgeNodeIds = Array.from(new Set(input.runtime.curriculumCoverages.filter((coverage) => coverage.lessonId === lesson.id).map((coverage) => coverage.nodeId))).sort();
      return knowledgeNodeIds.length > 1 ? [{ groupKey: `l${lesson.order + 1}`, identityKey: deterministicMappingId("lesson", lesson.id, "integrated"), knowledgeNodeIds }] : [];
    });
    const groups = [...individualGroups, ...lessonGroups];
    for (let offset = 0; offset < groups.length; offset += 6) {
      const batch = groups.slice(offset, offset + 6);
      const batchNodeIds = new Set(batch.flatMap((group) => group.knowledgeNodeIds));
      const batchInput = { ...chapterInput, knowledgeNodes: chapterInput.knowledgeNodes.filter((node) => batchNodeIds.has(node.id)) };
      const assignmentPrompt = assignmentGenerationPrompt(batchInput, batch);
      const result = await boundedGenerate(client, { stage: "assignments", promptVersion: COURSE_MAPPING_PROMPT_VERSION, schemaVersion: "course-assignments-v1", ...assignmentPrompt, maxTokens: 5_000, temperature: 0.1 }, (value) => parseGeneratedAssignmentGroups(value, batch, new Set(input.workflowTemplates.map((template) => template.id))));
      assignmentResults.push({ ...result, value: result.value.map((assignment) => ({ ...assignment, semanticKey: normalizeMappingSemanticKey(`${chapterId}-${assignment.semanticKey}`) })) });
    }
  }
  const assignments = assignmentResults.flatMap((result) => result.value);
  const dependencyResults = [];
  const dependencyKeyBySemantic = new Map(assignments.map((assignment, index) => [assignment.semanticKey, `d${index + 1}`]));
  const semanticByDependencyKey = new Map(Array.from(dependencyKeyBySemantic, ([semanticKey, dependencyKey]) => [dependencyKey, semanticKey]));
  const dependencyKeys = new Set(semanticByDependencyKey.keys());
  const orderedTargets = assignments.map((assignment) => assignment.semanticKey);
  const prerequisitePairs = new Set(input.knowledgeEdges.filter((edge) => edge.relation === "prerequisite").map((edge) => `${edge.source}:${edge.target}`));
  for (let offset = 0; offset < orderedTargets.length; offset += 4) {
    const targets = orderedTargets.slice(offset, offset + 4);
    const targetAssignments = assignments.filter((assignment) => targets.includes(assignment.semanticKey));
    const evidenceSources = assignments.filter((source) => targetAssignments.some((target) => source.semanticKey !== target.semanticKey && source.knowledgeNodeIds.some((sourceNodeId) => target.knowledgeNodeIds.some((targetNodeId) => prerequisitePairs.has(`${sourceNodeId}:${targetNodeId}`)))));
    const recentSources = assignments.slice(Math.max(0, Math.min(...targetAssignments.map((target) => assignments.indexOf(target))) - 4), Math.min(...targetAssignments.map((target) => assignments.indexOf(target))));
    const contextKeys = new Set([...targets, ...evidenceSources.map((assignment) => assignment.semanticKey), ...recentSources.map((assignment) => assignment.semanticKey)]);
    const shortTargets = targets.map((target) => dependencyKeyBySemantic.get(target) as string);
    const promptAssignments = assignments.filter((assignment) => contextKeys.has(assignment.semanticKey)).map((assignment) => ({ ...assignment, semanticKey: dependencyKeyBySemantic.get(assignment.semanticKey) as string }));
    const dependencyPrompt = assignmentDependencyPrompt(promptAssignments, scopedInput, shortTargets);
    const result = await boundedGenerate(client, { stage: "assignment-dependencies", promptVersion: COURSE_MAPPING_PROMPT_VERSION, schemaVersion: "assignment-dependencies-v1", ...dependencyPrompt, maxTokens: 3_000, temperature: 0 }, (value) => {
      return parseGeneratedDependencies(value, dependencyKeys).filter((edge) => shortTargets.includes(edge.targetSemanticKey)).map((edge) => ({ ...edge, sourceSemanticKey: semanticByDependencyKey.get(edge.sourceSemanticKey) as string, targetSemanticKey: semanticByDependencyKey.get(edge.targetSemanticKey) as string }));
    });
    dependencyResults.push(result);
  }
  const assignmentIndex = new Map(assignments.map((assignment, index) => [assignment.semanticKey, index]));
  const forwardDependencies = dependencyResults.flatMap((result) => result.value).filter((edge) => (assignmentIndex.get(edge.sourceSemanticKey) ?? Number.MAX_SAFE_INTEGER) < (assignmentIndex.get(edge.targetSemanticKey) ?? -1));
  const dependencyByPair = new Map(forwardDependencies.map((edge) => [`${edge.sourceSemanticKey}:${edge.targetSemanticKey}`, edge]));
  const dependencies = reduceAssignmentDependencies(assignments, Array.from(dependencyByPair.values())).dependencies;
  return { materialCoverage, assignments, dependencies, executions: [...assignmentResults.map((result) => result.metadata), ...dependencyResults.map((result) => result.metadata)] };
}
