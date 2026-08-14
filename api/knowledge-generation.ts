import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createJsonGenerationClient } from "./_lib/llm.js";
import { readLlmEnvironment } from "./_lib/env.js";
import { createServerSupabase, createUserSupabase, requireCapability } from "./_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";
import { SupabaseKnowledgeGenerationRepository } from "./_lib/knowledgeGenerationRepository.js";
import { runKnowledgeGenerationPipeline } from "../src/features/knowledge/generation/pipeline.js";
import { selectCourseMaterialScope } from "../src/features/knowledge/generation/materialScope.js";
import { KNOWLEDGE_GENERATION_PROMPT_VERSION } from "../src/features/knowledge/generation/prompts.js";
import type { CourseMaterialScope } from "../src/features/knowledge/generation/types.js";

export const maxDuration = 300;

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  const { user } = await createUserSupabase(request);
  await requireCapability(user, "global-domain-admin");
  const body = request.body as { parsingJobId?: unknown; scope?: CourseMaterialScope };
  if (typeof body?.parsingJobId !== "string" || !body.parsingJobId.trim()) throw new ApiError(400, "invalid_generation_request", "A completed parsingJobId is required");
  const env = readLlmEnvironment();
  const repository = new SupabaseKnowledgeGenerationRepository(createServerSupabase());
  const prepared = await repository.prepare({
    parsingJobId: body.parsingJobId, ownerId: user.id, provider: env.llmProvider, model: env.llmModel,
    promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
    schemaVersions: ["knowledge-candidates-v1", "knowledge-candidates-consolidated-v1", "knowledge-candidates-atomicity-audit-v1", "knowledge-candidate-admission-v1", "knowledge-relations-v1", "generated-curriculum-v1"]
  });
  try {
    const material = selectCourseMaterialScope(prepared.material, body.scope);
    const result = await runKnowledgeGenerationPipeline({ courseId: prepared.courseId, ownerId: user.id, material }, createJsonGenerationClient(env));
    await repository.persist(prepared.runId, result);
    json(response, 201, {
      run: { id: prepared.runId, status: "completed", provider: env.llmProvider, model: env.llmModel, promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION },
      result: { courseId: result.courseId, materialId: result.sourceMaterialId, candidateCount: result.candidates.length, duplicateCount: result.duplicateCount, relationCount: result.relations.length, chapterCount: result.curriculum.chapters.length }
    });
  } catch (error) {
    await repository.fail(prepared.runId, error);
    throw error;
  }
});
