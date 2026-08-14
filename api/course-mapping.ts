import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createJsonGenerationClient } from "./_lib/llm.js";
import { readLlmEnvironment } from "./_lib/env.js";
import { createServerSupabase, createUserSupabase, requireCapability } from "./_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";
import { SupabaseCourseMappingRepository } from "./_lib/courseMappingRepository.js";
import { runCourseMappingPipeline } from "../src/features/course/mapping/pipeline.js";
import { buildCourseMappingPlan } from "../src/features/course/mapping/mappingPlan.js";
import { COURSE_MAPPING_PROMPT_VERSION } from "../src/features/course/mapping/prompts.js";

export const maxDuration = 300;

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  const { user } = await createUserSupabase(request);
  await requireCapability(user, "global-domain-admin");
  const courseId = typeof request.body?.courseId === "string" ? request.body.courseId.trim() : "";
  const targetOutcome = typeof request.body?.targetOutcome === "string" ? request.body.targetOutcome.trim() : undefined;
  if (!courseId) throw new ApiError(400, "invalid_course_mapping_request", "A generated courseId is required");
  const env = readLlmEnvironment();
  const repository = new SupabaseCourseMappingRepository(createServerSupabase());
  const prepared = await repository.prepare({ courseId, ownerId: user.id, targetOutcome, provider: env.llmProvider, model: env.llmModel, promptVersion: COURSE_MAPPING_PROMPT_VERSION, schemaVersions: ["implementation-steps-v1", "course-assignments-v2", "assignment-dependencies-v1"] });
  try {
    const generation = await runCourseMappingPipeline({ runtime: prepared.runtime, knowledgeNodes: prepared.knowledgeNodes, knowledgeEdges: prepared.knowledgeEdges, workflowTemplates: prepared.workflowTemplates, targetOutcome: prepared.runtime.course.targetOutcome as string }, createJsonGenerationClient(env));
    const plan = buildCourseMappingPlan(prepared.runtime, generation);
    await repository.persist(prepared.runId, plan);
    json(response, 201, { run: { id: prepared.runId, status: "completed", promptVersion: COURSE_MAPPING_PROMPT_VERSION }, result: { courseId, targetOutcome: prepared.runtime.course.targetOutcome, stepCount: generation.steps.length, materialCoverageCount: plan.materialKnowledgeCoverages.length, assignmentCount: plan.assignments.length, assignmentCoverageCount: plan.assignmentCoverages.length, dependencyCount: plan.assignmentDependencies.length, outcomeCount: plan.chapterOutcomes.length, finalProjectCount: plan.finalProjects.length } });
  } catch (error) {
    await repository.fail(prepared.runId, error);
    throw error;
  }
});
