import type { GeneratedAssignmentCandidate, GeneratedAssignmentDependency } from "./types";
import { normalizeMappingSemanticKey } from "./deterministicId";

type JsonObject = Record<string, unknown>;
const object = (value: unknown, label: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
};
const text = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};
const strings = (value: unknown, label: string, minimum = 1) => {
  if (!Array.isArray(value) || value.length < minimum || !value.every((item) => typeof item === "string" && item.trim())) throw new Error(`${label} must be a non-empty string array`);
  return Array.from(new Set(value.map((item) => String(item).trim())));
};

export function parseGeneratedAssignments(value: unknown, allowedNodeIds: ReadonlySet<string>, allowedWorkflowTemplateIds: ReadonlySet<string>): GeneratedAssignmentCandidate[] {
  const root = object(value, "Assignment generation");
  if (!Array.isArray(root.assignments) || !root.assignments.length) throw new Error("assignments must be a non-empty array");
  const keys = new Set<string>();
  const result = root.assignments.map((value, index) => {
    const item = object(value, `assignments[${index}]`);
    const semanticKey = normalizeMappingSemanticKey(text(item.semanticKey, `assignments[${index}].semanticKey`));
    if (!semanticKey || keys.has(semanticKey)) throw new Error(`assignments[${index}].semanticKey must be unique`);
    keys.add(semanticKey);
    const mode = text(item.mode, `assignments[${index}].mode`) as "instruction" | "workflow";
    if (mode !== "instruction" && mode !== "workflow") throw new Error(`assignments[${index}].mode is unsupported`);
    const workflowTemplateId = item.workflowTemplateId === undefined ? undefined : text(item.workflowTemplateId, `assignments[${index}].workflowTemplateId`);
    if (mode === "workflow" && (!workflowTemplateId || !allowedWorkflowTemplateIds.has(workflowTemplateId))) throw new Error(`assignments[${index}] references an unavailable Workflow template`);
    if (mode === "instruction" && workflowTemplateId) throw new Error(`assignments[${index}] instruction mode cannot reference a Workflow template`);
    const knowledgeNodeIds = strings(item.knowledgeNodeIds, `assignments[${index}].knowledgeNodeIds`);
    if (knowledgeNodeIds.some((id) => !allowedNodeIds.has(id))) throw new Error(`assignments[${index}] references Knowledge outside the Course input`);
    const estimatedMinutes = item.estimatedMinutes === undefined ? undefined : Number(item.estimatedMinutes);
    if (estimatedMinutes !== undefined && (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)) throw new Error(`assignments[${index}].estimatedMinutes is invalid`);
    return {
      semanticKey, title: text(item.title, `assignments[${index}].title`), description: text(item.description, `assignments[${index}].description`),
      requirements: strings(item.requirements, `assignments[${index}].requirements`), expectedOutput: text(item.expectedOutput, `assignments[${index}].expectedOutput`),
      acceptanceCriteria: strings(item.acceptanceCriteria, `assignments[${index}].acceptanceCriteria`), mode,
      ...(workflowTemplateId ? { workflowTemplateId } : {}), ...(estimatedMinutes ? { estimatedMinutes } : {}),
      ...(typeof item.projectContribution === "string" && item.projectContribution.trim() ? { projectContribution: item.projectContribution.trim() } : {}), knowledgeNodeIds
    };
  });
  const covered = new Set(result.flatMap((assignment) => assignment.knowledgeNodeIds));
  const missing = Array.from(allowedNodeIds).filter((id) => !covered.has(id));
  if (missing.length) throw new Error(`Generated Assignments leave Knowledge without coverage: ${missing.join(", ")}`);
  return result;
}

export function parseGeneratedDependencies(value: unknown, assignmentKeys: ReadonlySet<string>): GeneratedAssignmentDependency[] {
  const root = object(value, "Assignment dependency generation");
  if (!Array.isArray(root.dependencies)) throw new Error("dependencies must be an array");
  return root.dependencies.map((value, index) => {
    const item = object(value, `dependencies[${index}]`);
    const sourceSemanticKey = normalizeMappingSemanticKey(text(item.sourceSemanticKey, `dependencies[${index}].sourceSemanticKey`));
    const targetSemanticKey = normalizeMappingSemanticKey(text(item.targetSemanticKey, `dependencies[${index}].targetSemanticKey`));
    if (!assignmentKeys.has(sourceSemanticKey) || !assignmentKeys.has(targetSemanticKey)) throw new Error(`dependencies[${index}] has a dangling Assignment key`);
    const strength = text(item.strength, `dependencies[${index}].strength`);
    if (strength !== "hard" && strength !== "soft") throw new Error(`dependencies[${index}].strength is unsupported`);
    return { sourceSemanticKey, targetSemanticKey, strength, rationale: text(item.rationale, `dependencies[${index}].rationale`) };
  });
}

export type AssignmentGenerationGroup = { groupKey: string; identityKey: string; knowledgeNodeIds: string[] };

export function parseGeneratedAssignmentGroups(value: unknown, groups: readonly AssignmentGenerationGroup[], allowedWorkflowTemplateIds: ReadonlySet<string>): GeneratedAssignmentCandidate[] {
  const root = object(value, "Assignment group generation");
  if (!Array.isArray(root.assignments)) throw new Error("assignments must be an array");
  const groupByKey = new Map(groups.map((group) => [group.groupKey, group]));
  const seen = new Set<string>();
  const candidates = root.assignments.map((value, index) => {
    const item = object(value, `assignments[${index}]`);
    const groupKey = normalizeMappingSemanticKey(text(item.groupKey, `assignments[${index}].groupKey`));
    const group = groupByKey.get(groupKey);
    if (!group || seen.has(groupKey)) throw new Error(`assignments[${index}].groupKey is unknown or duplicate`);
    seen.add(groupKey);
    const mode = text(item.mode, `assignments[${index}].mode`) as "instruction" | "workflow";
    if (mode !== "instruction" && mode !== "workflow") throw new Error(`assignments[${index}].mode is unsupported`);
    const workflowTemplateId = item.workflowTemplateId === undefined ? undefined : text(item.workflowTemplateId, `assignments[${index}].workflowTemplateId`);
    if (mode === "workflow" && (!workflowTemplateId || !allowedWorkflowTemplateIds.has(workflowTemplateId))) throw new Error(`assignments[${index}] references an unavailable Workflow template`);
    if (mode === "instruction" && workflowTemplateId) throw new Error(`assignments[${index}] instruction mode cannot reference a Workflow template`);
    const estimatedMinutes = item.estimatedMinutes === undefined ? undefined : Number(item.estimatedMinutes);
    if (estimatedMinutes !== undefined && (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)) throw new Error(`assignments[${index}].estimatedMinutes is invalid`);
    return { semanticKey: group.identityKey, title: text(item.title, `assignments[${index}].title`), description: text(item.description, `assignments[${index}].description`), requirements: strings(item.requirements, `assignments[${index}].requirements`), expectedOutput: text(item.expectedOutput, `assignments[${index}].expectedOutput`), acceptanceCriteria: strings(item.acceptanceCriteria, `assignments[${index}].acceptanceCriteria`), mode, ...(workflowTemplateId ? { workflowTemplateId } : {}), ...(estimatedMinutes ? { estimatedMinutes } : {}), ...(typeof item.projectContribution === "string" && item.projectContribution.trim() ? { projectContribution: item.projectContribution.trim() } : {}), knowledgeNodeIds: group.knowledgeNodeIds };
  });
  const missing = groups.filter((group) => !seen.has(group.groupKey));
  if (missing.length) throw new Error(`Generated Assignments omit groups: ${missing.map((group) => group.groupKey).join(", ")}`);
  return candidates;
}
