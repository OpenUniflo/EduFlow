import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AssistantContextSnapshot } from "../../src/features/assistant/assistantContract.js";
import { dataOrThrow } from "./query.js";
import { readEvidenceView } from "./evidenceRead.js";
import { readPracticeReview } from "./practiceContext.js";
import { getAssignmentContext, getCourseContext, getKnowledge, getLearnerState, getMaterialContext, getMicroContext, readableCourse } from "./assistantData.js";
export { getAssignmentContext, getCourseContext, getKnowledge, getKnowledgeNeighbors, getLearnerState, getMaterialContext, getMicroContext, navigationForAssistant, readableCourse, searchCourses, searchKnowledge, searchMaterialContent, searchMaterials, searchMicro } from "./assistantData.js";
import type { AssistantToolDependencies } from "./plugins/types.js";
import { assistantPlugins } from "./plugins/index.js";
export { assistantPlugins } from "./plugins/index.js";

type Row = Record<string, unknown>;

export type { AssistantToolDependencies } from "./plugins/types.js";

/**
 * One registration point for feature plugins. Each module owns its tools, the
 * cards it can nominate and the existing panel those cards open. Core context
 * resolution stays here because it spans plugins.
 */
export const assistantWriteTools = Object.assign({}, ...assistantPlugins.map((plugin) => plugin.writes ?? {}));

export function createAssistantTools(client: SupabaseClient, user: User, context: AssistantContextSnapshot, dependencies: AssistantToolDependencies = {}) {
  const pluginTools = Object.assign({}, ...assistantPlugins.map((plugin) => plugin.tools({ client, user, context, dependencies })));
  return {
    ...pluginTools,
    getCurrentContext: tool({
      description: "Resolve the current page's explicit EduFlow entity identities using authoritative product data.",
      inputSchema: z.object({}),
      execute: () => (async () => ({
        identity: context,
        evidence: context.diagnosisRunId ? await readEvidenceView(client, { view: "run", runId: context.diagnosisRunId }) : context.evidenceSourceId ? await readEvidenceView(client, { view: "source", sourceId: context.evidenceSourceId }) : undefined,
        knowledge: context.knowledgeId ? await getKnowledge(client, context.knowledgeId) : undefined,
        course: context.courseId ? await getCourseContext(client, user, context.courseId, context.knowledgeId) : undefined,
        material: context.courseId && context.materialId ? await getMaterialContext(client, user, context.courseId, context.materialId, context.segmentId) : undefined,
        practiceReview: context.actionRunId ? await (async () => {
          const found = await client.from("learning_attempts").select("id").eq("user_id", user.id).eq("action_run_id", context.actionRunId!).is("withdrawn_at", null).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
          const attempt = dataOrThrow(found.data as Row | null, found.error, "Review Attempt");
          return attempt ? readPracticeReview(client, user.id, attempt.id as string) : undefined;
        })() : undefined,
        assignment: context.courseId && context.assignmentId ? await getAssignmentContext(client, user, context.courseId, context.assignmentId) : undefined,
        micro: context.microPathId ? await getMicroContext(client, user, context.microPathId, context.microUnitId, context.microStepId) : undefined,
        learner: await getLearnerState(client, user, context.knowledgeId, context.courseId)
      }))().catch((error) => ({ error: { code: "tool_failed", message: error instanceof Error ? error.message : "Tool failed" } }))
    })
  };
}
