import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { StructuredGenerationClient } from "../../src/features/knowledge/generation/types.js";
import { createJsonGenerationClient } from "./llm.js";
import { dataOrThrow } from "./query.js";

type Row = Record<string, unknown>;

const outputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    intentSummary: z.string().trim().min(1).max(500),
    candidateKnowledgeIds: z.array(z.string().trim().min(1)).min(1).max(20)
  }),
  z.object({
    status: z.literal("clarify"),
    intentSummary: z.string().trim().min(1).max(500),
    clarificationQuestion: z.string().trim().min(1).max(500)
  }),
  z.object({
    status: z.literal("unsupported"),
    intentSummary: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500)
  })
]);

export type GoalLanguageResolution = z.infer<typeof outputSchema>;

export function parseGoalLanguageResolution(value: unknown): GoalLanguageResolution {
  return outputSchema.parse(value);
}

export async function resolveGoalLanguage(
  client: SupabaseClient,
  input: { goalText: string; previousGoalText?: string; refinement?: string; conversationContext?: Array<{ role: string; content: string }> },
  generator: StructuredGenerationClient = createJsonGenerationClient()
): Promise<GoalLanguageResolution> {
  const result = await client.from("knowledge_nodes").select("id,title,description,tags").eq("status", "active").limit(1000);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Goal language Knowledge catalog lookup");
  const catalog = rows.map((row) => ({
    id: String(row.id), title: String(row.title), description: String(row.description).slice(0, 600),
    tags: Array.isArray(row.tags) ? row.tags.map(String).slice(0, 12) : []
  }));
  const generated = await generator.generateJson({
    stage: "goal-resolution", promptVersion: "goal-resolution-v2", schemaVersion: "1", temperature: 0, maxTokens: 900,
    system: `You are the language-understanding adapter for EduFlow Goal Planner. Understand novice language semantically. You may select only IDs present in the supplied visible active Knowledge catalog. Select the smallest independently teachable target set that represents the requested outcome, never more than 12 IDs; prerequisites are computed later and must not be added merely because they are prerequisites. Never invent an ID, Course, Knowledge, score, prerequisite, or learning path. If the goal is too broad to choose teachable targets safely, ask one concise clarification question. Return JSON only as one of: {"status":"ready","intentSummary":"...","candidateKnowledgeIds":["..."]}, {"status":"clarify","intentSummary":"...","clarificationQuestion":"..."}, or {"status":"unsupported","intentSummary":"...","reason":"..."}. When refinement is present, previousGoalText is the authoritative learning outcome and refinement only adds preferences or constraints unless the refinement explicitly asks to change the outcome. Preserve the original subject and capability; words such as practical, shorter, easier, or less theoretical must not introduce a different subject. Do not pretend a preference changes deterministic Course coverage metrics.`,
    user: JSON.stringify({ goalText: input.goalText, previousGoalText: input.previousGoalText, refinement: input.refinement, conversationContext: input.conversationContext, visibleKnowledgeCatalog: catalog })
  });
  return parseGoalLanguageResolution(generated.value);
}
