import type { AssignmentMode, MaterialKnowledgeCoverage } from "@/features/course/types";
import type { KnowledgeEdge, KnowledgeNode } from "@/features/knowledge/types";
import type { ModelExecutionMetadata } from "@/features/knowledge/generation/types";
import type { CourseRuntimeData } from "../runtime/courseRuntime";

export type GeneratedAssignmentCandidate = {
  semanticKey: string;
  title: string;
  description: string;
  requirements: string[];
  expectedOutput: string;
  acceptanceCriteria: string[];
  mode: AssignmentMode;
  workflowTemplateId?: string;
  estimatedMinutes?: number;
  projectContribution?: string;
  knowledgeNodeIds: string[];
};

export type GeneratedAssignmentDependency = {
  sourceSemanticKey: string;
  targetSemanticKey: string;
  strength: "hard" | "soft";
  rationale: string;
};

export type AvailableWorkflowTemplate = { id: string; title: string; description?: string };

export type CourseMappingInput = {
  runtime: CourseRuntimeData;
  knowledgeNodes: KnowledgeNode[];
  knowledgeEdges: KnowledgeEdge[];
  workflowTemplates: AvailableWorkflowTemplate[];
};

export type ResolvedMaterialCoverage = {
  coverages: MaterialKnowledgeCoverage[];
  unresolved: Array<{ nodeId: string; materialId?: string; reason: string }>;
};

export type CourseMappingGeneration = {
  materialCoverage: ResolvedMaterialCoverage;
  assignments: GeneratedAssignmentCandidate[];
  dependencies: GeneratedAssignmentDependency[];
  executions: ModelExecutionMetadata[];
};
