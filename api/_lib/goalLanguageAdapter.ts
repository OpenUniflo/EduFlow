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
    primaryOutcome: z.string().trim().min(1).max(500),
    refinementIntent: z.enum(["preserve_outcome", "change_outcome"]),
    candidateKnowledgeIds: z.array(z.string().trim().min(1)).min(1).max(6),
    targetReasons: z.array(z.object({
      knowledgeId: z.string().trim().min(1),
      reason: z.string().trim().min(1).max(300)
    })).min(1).max(6)
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

const semanticCheckSchema = z.object({
  coherent: z.boolean(),
  directlySupportingKnowledgeIds: z.array(z.string().trim().min(1)).max(6),
  clarificationQuestion: z.string().trim().min(1).max(500).optional()
});

export type GoalLanguageResolution = z.infer<typeof outputSchema>;

export function parseGoalLanguageResolution(value: unknown): GoalLanguageResolution {
  return outputSchema.parse(value);
}

function safeGoalLanguageResolution(value: unknown): GoalLanguageResolution {
  const strict = outputSchema.safeParse(value);
  if (strict.success) return strict.data;
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const status = row.status;
  const summary = typeof row.intentSummary === "string" && row.intentSummary.trim() ? row.intentSummary.trim() : "我需要再确认一下你最想先完成的具体成果。";
  if (status === "ready" && Array.isArray(row.candidateKnowledgeIds) && row.candidateKnowledgeIds.length) {
    const candidateKnowledgeIds = [...new Set(row.candidateKnowledgeIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))].slice(0, 6);
    if (candidateKnowledgeIds.length) return {
      status: "ready", intentSummary: summary,
      primaryOutcome: typeof row.primaryOutcome === "string" && row.primaryOutcome.trim() ? row.primaryOutcome.trim() : summary,
      refinementIntent: row.refinementIntent === "change_outcome" ? "change_outcome" : "preserve_outcome",
      candidateKnowledgeIds,
      targetReasons: candidateKnowledgeIds.map((knowledgeId) => ({ knowledgeId, reason: "该候选被提议为直接支持主要成果，仍需独立语义复核。" }))
    };
  }
  if (status === "unsupported") return { status: "unsupported", intentSummary: summary, reason: typeof row.reason === "string" && row.reason.trim() ? row.reason.trim() : "当前可见学习内容暂时无法可靠支持这个目标。" };
  const question = [row.clarificationQuestion, row.question, row.clarification, row.reason].find((item) => typeof item === "string" && item.trim());
  return { status: "clarify", intentSummary: summary, clarificationQuestion: typeof question === "string" ? question.trim() : "你最想先做出什么具体结果？" };
}

export function hasExplicitOutcomeChangeLanguage(value: string) {
  return /(?:不想|不要).{0,24}(?:了|而是|改)|(?:改|换)(?:成|为|学|目标)|重新(?:选择|确定).{0,8}(?:目标|方向)|(?:switch|change|replace).{0,24}(?:goal|subject|outcome|to)|(?:instead of|no longer want)/iu.test(value);
}

export function isGoalLanguageProviderUnavailable(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /(?:fetch|network|timeout|timed out|ECONN|provider|upstream|socket)/i.test(error.message));
}

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
  const generated = await generator.generateJson({
    stage: "goal-resolution", promptVersion: "goal-resolution-v3", schemaVersion: "2", temperature: 0, maxTokens: 1200,
    system: `You are the language-understanding adapter for EduFlow Goal Planner. Understand novice outcome language semantically. When conversationContext is present, the current goalText may be the learner's short answer to the most recent Assistant clarification; resolve it together with the earlier learner goal instead of treating it as a new standalone request or repeating an already-answered question. intentSummary and primaryOutcome must describe the resolved whole outcome, not only the latest reply. Clarify only when the missing answer could change the direct target Knowledge identities. Once the capability and artifact class are clear enough to choose a minimal target set, return ready. If one atomic catalog identity names the concrete capability or artifact the learner wants, prefer that identity alone; its internal theory, training mechanics, optimization, evaluation, and background belong to prerequisite closure or later Course scope unless the learner explicitly makes them separate outcomes. Do not ask how much theory to understand or whether to include such supporting mechanisms once the concrete outcome is known. Do not ask about UI versus command line, packaging, deployment, framework, device, hosting, delivery format, pace, depth, or practice style when those details would not change the direct target Knowledge; those are later Course Creator preferences. You may select only IDs present in the supplied visible active Knowledge catalog. Select at most 6 independently teachable target identities that directly constitute the same primary outcome. Do not select background, prerequisites, broad adjacent topics, alternative solution families, or Knowledge that is merely useful. Prerequisites are computed by the product later. If the resolved outcome is still too broad or the direct target set is uncertain, ask one concise novice-friendly clarification question using outcome examples rather than specialist architecture names. Never invent an identity, Course, score, prerequisite, or learning path. For ready output return {"status":"ready","intentSummary":"...","primaryOutcome":"...","refinementIntent":"preserve_outcome|change_outcome","candidateKnowledgeIds":["..."],"targetReasons":[{"knowledgeId":"...","reason":"how this directly delivers the primary outcome"}]}. Every candidate must have exactly one reason. Otherwise return the clarify or unsupported shape. When refinement is present, previousGoalText is authoritative. Practical, shorter, easier, project-oriented, pace, depth, and format preferences preserve the outcome. Mark change_outcome only when the learner explicitly replaces the subject/capability.`,
    user: JSON.stringify({ goalText: input.goalText, goalTextRole: input.conversationContext?.length ? "answer_to_latest_clarification" : "initial_goal", previousGoalText: input.previousGoalText, previousKnowledgeIds: input.previousKnowledgeIds, refinement: input.refinement, conversationContext: input.conversationContext, visibleKnowledgeCatalog: catalog })
  });
  let parsed = safeGoalLanguageResolution(generated.value);
  if (parsed.status === "clarify" && input.conversationContext?.length) {
    const adjudicated = await generator.generateJson({
      stage: "goal-resolution", promptVersion: "goal-clarification-audit-v1", schemaVersion: "2", temperature: 0, maxTokens: 1200,
      system: `Independently decide whether the proposed clarification is necessary to choose EduFlow's direct target Knowledge identities. Use the resolved conversation, current learner reply, proposed question, and visible active Knowledge catalog. Clarification is necessary only when different answers would select materially different direct outcome identities. If one atomic catalog identity names the learner's concrete capability or artifact, return ready with that identity rather than asking whether to include theory, understanding, training mechanics, optimization, evaluation, or background; those are prerequisite or Course-scope concerns. UI versus command line, packaging, deployment, framework, device, hosting, delivery format, pace, depth, and practice preference belong to later Course Creator choices and do not justify blocking Goal resolution. If necessary, return the clarify contract with one concise question. If unnecessary and the catalog supports the outcome, return the complete ready contract with a minimal coherent target set, exactly one reason per target, and no prerequisites or adjacent topics. If the catalog cannot support it, return unsupported. Never invent an ID.`,
      user: JSON.stringify({ goalText: input.goalText, conversationContext: input.conversationContext, proposedClarification: parsed.clarificationQuestion, visibleKnowledgeCatalog: catalog })
    });
    parsed = safeGoalLanguageResolution(adjudicated.value);
  }
  if (parsed.status !== "ready") return parsed;

  const catalogIds = new Set(catalog.map((item) => item.id));
  const candidateIds = [...new Set(parsed.candidateKnowledgeIds)];
  const reasonIds = parsed.targetReasons.map((item) => item.knowledgeId);
  if (candidateIds.some((id) => !catalogIds.has(id)) || reasonIds.length !== candidateIds.length || reasonIds.some((id) => !candidateIds.includes(id)) || new Set(reasonIds).size !== reasonIds.length) {
    return { status: "unsupported", intentSummary: parsed.intentSummary, reason: "目标候选未通过真实 Knowledge 身份校验。" };
  }

  const explicitChange = Boolean(input.refinement && hasExplicitOutcomeChangeLanguage(input.refinement));
  if (input.refinement && parsed.refinementIntent === "change_outcome" && !explicitChange) {
    return { status: "clarify", intentSummary: parsed.intentSummary, clarificationQuestion: `你是想继续原来的「${input.previousGoalText ?? input.goalText}」并调整学习方式，还是要更换学习目标？` };
  }
  if (input.refinement && !explicitChange && input.previousKnowledgeIds?.length) {
    return {
      ...parsed,
      primaryOutcome: input.previousGoalText ?? parsed.primaryOutcome,
      refinementIntent: "preserve_outcome",
      candidateKnowledgeIds: [...new Set(input.previousKnowledgeIds)].filter((id) => catalogIds.has(id)),
      targetReasons: [...new Set(input.previousKnowledgeIds)].filter((id) => catalogIds.has(id)).map((knowledgeId) => ({ knowledgeId, reason: "保留原始学习目标的已验证核心目标。" }))
    };
  }

  const selectedKnowledge = catalog.filter((item) => candidateIds.includes(item.id));
  const checked = await generator.generateJson({
    stage: "goal-resolution", promptVersion: "goal-semantic-check-v1", schemaVersion: "1", temperature: 0, maxTokens: 700,
    system: `Independently normalize a proposed EduFlow Goal target set. Return JSON only: {"coherent":boolean,"directlySupportingKnowledgeIds":["..."],"clarificationQuestion"?:"..."}. directlySupportingKnowledgeIds may be a non-empty subset of the supplied proposal: remove prerequisites, internal mechanisms, background topics, adjacent domains, alternative solution families, and speculative helpful topics. Set coherent=true when the retained subset is minimal, bounded, and every retained item directly delivers the same primary outcome, even if you removed proposed items. If one atomic identity names the concrete capability or artifact, prefer it over its internal mechanisms. Use only supplied IDs. Set coherent=false only when no non-empty coherent direct subset can be established or the primary outcome itself remains ambiguous; then ask one concise novice-friendly clarification question.`,
    user: JSON.stringify({ goalText: input.goalText, conversationContext: input.conversationContext, previousGoalText: input.previousGoalText, refinement: input.refinement, primaryOutcome: parsed.primaryOutcome, proposedTargets: selectedKnowledge, targetReasons: parsed.targetReasons })
  });
  const semanticResult = semanticCheckSchema.safeParse(checked.value);
  if (!semanticResult.success) return { status: "clarify", intentSummary: parsed.intentSummary, clarificationQuestion: "为了避免把课程范围扩得太大，你最想先完成哪一个具体成果？" };
  const semantic = semanticResult.data;
  const directIds = [...new Set(semantic.directlySupportingKnowledgeIds)].filter((id) => candidateIds.includes(id));
  if (!semantic.coherent || !directIds.length) {
    return { status: "clarify", intentSummary: parsed.intentSummary, clarificationQuestion: semantic.clarificationQuestion ?? "为了避免把课程范围扩得太大，你最想先完成哪一个具体成果？" };
  }
  return {
    ...parsed,
    candidateKnowledgeIds: directIds,
    targetReasons: directIds.map((knowledgeId) => parsed.targetReasons.find((reason) => reason.knowledgeId === knowledgeId)!)
  };
}
