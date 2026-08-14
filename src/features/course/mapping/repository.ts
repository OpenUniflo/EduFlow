import type { CourseMappingPlan } from "./mappingPlan";
import type { AvailableWorkflowTemplate } from "./types";
import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { KnowledgeEdge, KnowledgeNode } from "@/features/knowledge/types";

export type PreparedCourseMapping = {
  runId: string;
  runtime: CourseRuntimeData;
  knowledgeNodes: KnowledgeNode[];
  knowledgeEdges: KnowledgeEdge[];
  workflowTemplates: AvailableWorkflowTemplate[];
};

export interface CourseMappingRepository {
  prepare(input: { courseId: string; ownerId: string; targetOutcome?: string; provider: string; model: string; promptVersion: string; schemaVersions: string[] }): Promise<PreparedCourseMapping>;
  persist(runId: string, plan: CourseMappingPlan): Promise<void>;
  fail(runId: string, error: unknown): Promise<void>;
}
