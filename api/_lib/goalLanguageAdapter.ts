import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { StructuredGenerationClient } from "../../src/features/knowledge/generation/types.js";
import { createJsonGenerationClient } from "./llm.js";
import { dataOrThrow } from "./query.js";

type Row = Record<string, unknown>;

const targetReasonSchema = z.object({
  knowledgeId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(300)
});

const outputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    intentSummary: z.string().trim().min(1).max(500),
    primaryOutcome: z.string().trim().min(1).max(500),
    refinementIntent: z.enum(["preserve_outcome", "change_outcome"]),
    practiceEmphasis: z.boolean(),
    candidateKnowledgeIds: z.array(z.string().trim().min(1)).min(1).max(6),
    targetReasons: z.array(targetReasonSchema).min(1).max(6)
  }),
  z.object({
    status: z.literal("needs_clarification"),
    intentSummary: z.string().trim().min(1).max(500),
    clarificationQuestion: z.string().trim().min(1).max(500)
  }),
  z.object({
    status: z.literal("no_match"),
    intentSummary: z.string().trim().min(1).max(500),
    primaryOutcome: z.string().trim().min(1).max(500),
    practiceEmphasis: z.boolean(),
    reason: z.string().trim().min(1).max(500)
  })
]);

export type GoalLanguageResolution = z.infer<typeof outputSchema>;

export function parseGoalLanguageResolution(value: unknown): GoalLanguageResolution {
  return outputSchema.parse(value);
}

export function isGoalLanguageProviderUnavailable(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /(?:fetch|network|timeout|timed out|ECONN|provider|upstream|socket)/i.test(error.message));
}

/**
 * The model is a language adapter only. One strict structured result decides
 * whether the Goal itself needs clarification and suggests catalog identities;
 * product code then validates every identity deterministically.
 */
export async function resolveGoalLanguage(
  client: SupabaseClient,
  input: { goalText: string; previousGoalText?: string; previousKnowledgeIds?: string[]; refinement?: string; conversationContext?: Array<{ role: string; content: string }> },
  generator: StructuredGenerationClient = createJsonGenerationClient()
): Promise<GoalLanguageResolution> {
  const result = await client.from("knowledge_nodes").select("id,title,description,tags").eq("status", "active").limit(1000);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Goal language Knowledge catalog lookup");
  const catalog = rows.map((row) => ({
    id: String(row.id), title: String(row.title), description: String(row.description).slice(0, 600),
    tags: Array.isArray(row.tags) ? row.tags.map(String).slice(0, 12) : []
  }));
  const catalogIds = new Set(catalog.map((item) => item.id));

  // Continue Search changes Course preferences, not the confirmed Goal.
  if (input.refinement && input.previousKnowledgeIds?.length) {
    const previousIds = [...new Set(input.previousKnowledgeIds)];
    const preservedIds = previousIds.filter((id) => catalogIds.has(id));
    if (preservedIds.length !== previousIds.length) throw new Error("Previously validated Goal Knowledge is no longer visible");
    const outcome = input.previousGoalText?.trim() || input.goalText.trim();
    return {
      status: "ready",
      intentSummary: outcome,
      primaryOutcome: outcome,
      refinementIntent: "preserve_outcome",
      practiceEmphasis: false,
      candidateKnowledgeIds: preservedIds,
      targetReasons: preservedIds.map((knowledgeId) => ({ knowledgeId, reason: "保留原始学习目标中已经验证的核心学习内容。" }))
    };
  }

  const generated = await generator.generateJson({
    stage: "goal-resolution", promptVersion: "goal-resolution-v4", schemaVersion: "3", temperature: 0, maxTokens: 1200,
    system: `You are the single language-understanding adapter for EduFlow Goal Planner. Decide Goal clarity independently from catalog coverage. Return exactly one strict JSON shape with status ready, needs_clarification, or no_match. A Goal is clear once the learner names a concrete capability or deliverable class well enough to choose direct target Knowledge. Do not ask about theory depth, training mechanics, optimization, evaluation, UI versus command line, packaging, deployment, framework, device, hosting, delivery format, pace, or practice style when those choices would not change the direct outcome identity. Preserve an explicitly stated hands-on, project, implementation, or build preference only as the boolean practiceEmphasis; it must not change Goal clarity or target identity. Use needs_clarification only when different learner answers would materially change that identity. Use no_match only when the Goal is already clear but no visible active catalog identity directly supports it. For ready, select at most 6 real catalog IDs that directly constitute one primary outcome; exclude prerequisites, background, internal mechanisms, adjacent topics, and alternatives. If one atomic identity names the concrete capability or artifact, prefer it alone. Every candidate must have exactly one reason. Never invent an ID, Course, score, prerequisite, or learning path. Return ready as {"status":"ready","intentSummary":"...","primaryOutcome":"...","refinementIntent":"preserve_outcome|change_outcome","practiceEmphasis":boolean,"candidateKnowledgeIds":["..."],"targetReasons":[{"knowledgeId":"...","reason":"..."}]}; needs_clarification as {"status":"needs_clarification","intentSummary":"...","clarificationQuestion":"..."}; no_match as {"status":"no_match","intentSummary":"...","primaryOutcome":"...","practiceEmphasis":boolean,"reason":"..."}.`,
    user: JSON.stringify({
      goalText: input.goalText,
      goalTextRole: input.conversationContext?.length ? "answer_to_latest_clarification" : "initial_goal",
      previousGoalText: input.previousGoalText,
      conversationContext: input.conversationContext,
      visibleKnowledgeCatalog: catalog
    })
  });
  const parsed = parseGoalLanguageResolution(generated.value);
  if (parsed.status !== "ready") return parsed;

  const candidateIds = [...new Set(parsed.candidateKnowledgeIds)];
  const reasonIds = parsed.targetReasons.map((item) => item.knowledgeId);
  if (
    candidateIds.some((id) => !catalogIds.has(id))
    || reasonIds.length !== candidateIds.length
    || reasonIds.some((id) => !candidateIds.includes(id))
    || new Set(reasonIds).size !== reasonIds.length
  ) throw new Error("Goal candidate identities failed catalog validation");

  return {
    ...parsed,
    candidateKnowledgeIds: candidateIds,
    targetReasons: candidateIds.map((knowledgeId) => parsed.targetReasons.find((reason) => reason.knowledgeId === knowledgeId)!)
  };
}
