import type { StructuredGenerationClient } from "@/features/knowledge/generation/types";
import { reduceAssignmentDependencies, retrieveDependencyCandidates } from "./assignmentDag";
import { resolveMaterialCoverage } from "./materialCoverage";
import { assignmentDependencyPrompt, assignmentGenerationPrompt, COURSE_MAPPING_PROMPT_VERSION, implementationStepPrompt } from "./prompts";
import { parseGeneratedAssignmentGroups, parseGeneratedDependencies, parseImplementationSteps, type AssignmentGenerationGroup } from "./schema";
import type { CourseMappingGeneration, CourseMappingInput } from "./types";
import { normalizeMappingSemanticKey } from "./deterministicId";

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
  if (!input.targetOutcome.trim()) throw new Error("Course mapping requires a targetOutcome");
  const stepPrompt = implementationStepPrompt(scopedInput);
  const stepResults = [await boundedGenerate(client, { stage: "implementation-steps", promptVersion: COURSE_MAPPING_PROMPT_VERSION, schemaVersion: "implementation-steps-v1", ...stepPrompt, maxTokens: 8_000, temperature: 0.1 }, (value) => parseImplementationSteps(value, input.runtime.course.id, courseNodeIds, false))];
  let steps = stepResults[0].value;
  const coveredStepNodeIds = new Set(steps.flatMap((step) => step.knowledgeNodeIds));
  const missingStepNodeIds = activeNodes.filter((node) => !coveredStepNodeIds.has(node.id));
  if (missingStepNodeIds.length) {
    const reconciliation = await boundedGenerate(client, {
      stage: "implementation-steps", promptVersion: COURSE_MAPPING_PROMPT_VERSION, schemaVersion: "implementation-steps-v1", maxTokens: 8_000, temperature: 0,
      system: `${stepPrompt.system} The previous plan omitted required Knowledge. Return the complete revised steps array, preserving coherent existing groups while assigning every missing ID to a genuinely relevant existing or new implementation milestone.`,
      user: JSON.stringify({ targetOutcome: input.targetOutcome, existingSteps: steps, missingKnowledge: missingStepNodeIds.map((node) => ({ id: node.id, title: node.title, description: node.description, masteryCriteria: node.masteryCriteria })), requiredOutputSchema: { steps: [{ stepKey: "unique key", title: "string", objective: "string", knowledgeNodeIds: ["exact supplied IDs"] }] } })
    }, (value) => parseImplementationSteps(value, input.runtime.course.id, courseNodeIds));
    stepResults.push(reconciliation);
    steps = reconciliation.value;
  }
  const assignmentResults = [];
  const groups: AssignmentGenerationGroup[] = steps.map((step, index) => ({ groupKey: `s${index + 1}`, identityKey: step.semanticKey, title: step.title, objective: step.objective, knowledgeNodeIds: step.knowledgeNodeIds }));
  for (let offset = 0; offset < groups.length; offset += 6) {
    const batch = groups.slice(offset, offset + 6);
    const batchNodeIds = new Set(batch.flatMap((group) => group.knowledgeNodeIds));
    const batchInput = { ...scopedInput, knowledgeNodes: activeNodes.filter((node) => batchNodeIds.has(node.id)) };
    const assignmentPrompt = assignmentGenerationPrompt(batchInput, batch);
    const result = await boundedGenerate(client, { stage: "assignments", promptVersion: COURSE_MAPPING_PROMPT_VERSION, schemaVersion: "course-assignments-v2", ...assignmentPrompt, maxTokens: 5_000, temperature: 0.1 }, (value) => parseGeneratedAssignmentGroups(value, batch, new Set(input.workflowTemplates.map((template) => template.id))));
    assignmentResults.push({ ...result, value: result.value.map((assignment) => ({ ...assignment, semanticKey: normalizeMappingSemanticKey(assignment.semanticKey) })) });
  }
  const assignments = assignmentResults.flatMap((result) => result.value);
  const dependencyResults = [];
  const dependencyKeyBySemantic = new Map(assignments.map((assignment, index) => [assignment.semanticKey, `d${index + 1}`]));
  const semanticByDependencyKey = new Map(Array.from(dependencyKeyBySemantic, ([semanticKey, dependencyKey]) => [dependencyKey, semanticKey]));
  const dependencyKeys = new Set(semanticByDependencyKey.keys());
  const orderedTargets = assignments.map((assignment) => assignment.semanticKey);
  for (let offset = 0; offset < orderedTargets.length; offset += 4) {
    const targets = orderedTargets.slice(offset, offset + 4);
    const targetAssignments = assignments.filter((assignment) => targets.includes(assignment.semanticKey));
    const evidenceSources = targetAssignments.flatMap((target) => retrieveDependencyCandidates(target, assignments, input.knowledgeEdges));
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
  return { materialCoverage, steps, assignments, dependencies, executions: [...stepResults.map((result) => result.metadata), ...assignmentResults.map((result) => result.metadata), ...dependencyResults.map((result) => result.metadata)] };
}
