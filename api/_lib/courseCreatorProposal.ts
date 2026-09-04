import { z } from "zod";
import type { StructuredGenerationClient } from "../../src/features/knowledge/generation/types.js";
import { createJsonGenerationClient } from "./llm.js";

const proposalSchema = z.object({
  intent: z.enum(["explain", "edit"]),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(600),
  goal: z.string().trim().max(1000).optional(),
  learnerFoundation: z.string().trim().max(500).optional(),
  timeConstraint: z.string().trim().max(300).optional(),
  preferences: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  knowledgeChanges: z.array(z.object({
    nodeId: z.string().trim().min(1),
    action: z.literal("include"),
    role: z.enum(["target", "optional"])
  })).max(1000).optional(),
  removeKnowledgeIds: z.array(z.string().trim().min(1)).max(1000).optional(),
  orderedKnowledgeIds: z.array(z.string().trim().min(1)).max(1000).optional(),
  moves: z.array(z.object({ nodeId: z.string().trim().min(1), chapterId: z.string().trim().min(1) })).max(1000).optional()
  ,desiredAssets: z.array(z.object({ nodeId: z.string().trim().min(1), assetType: z.enum(["material", "micro", "assignment"]), desired: z.boolean() })).max(1000).optional()
});

export type GeneratedCourseCreatorProposal = z.infer<typeof proposalSchema>;

export function isCourseCreatorProviderUnavailable(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /(?:fetch|network|timeout|timed out|ECONN|provider|upstream|socket)/i.test(error.message));
}

export function parseGeneratedCourseCreatorProposal(value: unknown, allowedKnowledgeIds: ReadonlySet<string>, allowedChapterIds: ReadonlySet<string>) {
  const parsed = proposalSchema.parse(value);
  const knowledgeIds = [
    ...(parsed.knowledgeChanges ?? []).map((change) => change.nodeId), ...(parsed.removeKnowledgeIds ?? []), ...(parsed.orderedKnowledgeIds ?? []),
    ...(parsed.moves ?? []).map((move) => move.nodeId), ...(parsed.desiredAssets ?? []).map((item) => item.nodeId)
  ];
  const invalidKnowledgeIds = [...new Set(knowledgeIds)].filter((id) => !allowedKnowledgeIds.has(id));
  if (invalidKnowledgeIds.length) throw new Error(`Course Creator proposal references unavailable Knowledge: ${invalidKnowledgeIds.join(", ")}`);
  const invalidChapterIds = [...new Set((parsed.moves ?? []).map((move) => move.chapterId))].filter((id) => !allowedChapterIds.has(id));
  if (invalidChapterIds.length) throw new Error(`Course Creator proposal references unavailable Chapters: ${invalidChapterIds.join(", ")}`);
  return parsed;
}

export async function generateCourseCreatorProposal(input: {
  stage: string;
  instruction: string;
  brief: unknown;
  current: unknown;
  visibleKnowledge: Array<{ id: string; title: string; description: string }>;
  chapterIds: string[];
}, generator: StructuredGenerationClient = createJsonGenerationClient()) {
  const generated = await generator.generateJson({
    stage: "course-creator-proposal", promptVersion: "course-creator-proposal-v2", schemaVersion: "2", temperature: 0, maxTokens: 1200,
    system: `You are the structured semantic adapter inside EduFlow's single Course Creator pipeline. Return JSON only. First classify the learner's request as intent "explain" or "edit". Workflow navigation is owned by the page buttons, so never emit a navigation intent. When uncertain, return "explain" with no mutation fields. You never mutate or publish; the product validates and the user explicitly applies. For explain, answer in title/summary and return no mutation fields. For edit, use only Knowledge IDs and Chapter IDs supplied by the product. Never turn curriculum order into a Knowledge prerequisite. For requirements, propose only goal/foundation/time/preferences. For scope, use knowledgeChanges with action "include" and role "target" or "optional", plus removeKnowledgeIds; prerequisite is forbidden because factual prerequisite closure is product-derived. For structure, use orderedKnowledgeIds and moves; do not add or remove Knowledge facts. For assets, desiredAssets may mark a Material, Micro, or Assignment as desired for existing scoped Knowledge; this is a plan only and must not claim to create an asset. For draft/publish, explain warnings or recommended edits without claiming that missing assets block creation. Output: {"intent":"explain|edit","title":"...","summary":"...","goal"?:"...","learnerFoundation"?:"...","timeConstraint"?:"...","preferences"?:[],"knowledgeChanges"?: [{"nodeId":"...","action":"include","role":"target|optional"}],"removeKnowledgeIds"?:[],"orderedKnowledgeIds"?:[],"moves"?:[],"desiredAssets"?: [{"nodeId":"...","assetType":"material|micro|assignment","desired":true}]}.`,
    user: JSON.stringify(input)
  });
  const parsed = parseGeneratedCourseCreatorProposal(generated.value, new Set(input.visibleKnowledge.map((item) => item.id)), new Set(input.chapterIds));
  const current = input.current as { scope?: { targetKnowledgeIds?: string[]; prerequisiteKnowledgeIds?: string[]; optionalKnowledgeIds?: string[] } };
  const currentIds = new Set([...(current.scope?.targetKnowledgeIds ?? []), ...(current.scope?.prerequisiteKnowledgeIds ?? []), ...(current.scope?.optionalKnowledgeIds ?? [])]);
  const unique = (ids: string[] | undefined) => [...new Set(ids ?? [])];
  if (parsed.intent === "explain") return {
    ...parsed,
    goal: undefined, learnerFoundation: undefined, timeConstraint: undefined, preferences: undefined,
    knowledgeChanges: [], removeKnowledgeIds: [], orderedKnowledgeIds: [], moves: [], desiredAssets: []
  };
  return {
    ...parsed,
    knowledgeChanges: (parsed.knowledgeChanges ?? []).filter((change, index, values) => !currentIds.has(change.nodeId) && values.findIndex((candidate) => candidate.nodeId === change.nodeId) === index).slice(0, 20),
    removeKnowledgeIds: unique(parsed.removeKnowledgeIds).filter((id) => currentIds.has(id)).slice(0, 20),
    orderedKnowledgeIds: unique(parsed.orderedKnowledgeIds).filter((id) => currentIds.has(id)).slice(0, 80),
    moves: (parsed.moves ?? []).filter((move, index, values) => currentIds.has(move.nodeId) && values.findIndex((candidate) => candidate.nodeId === move.nodeId) === index).slice(0, 40),
    desiredAssets: (parsed.desiredAssets ?? []).filter((item, index, values) => currentIds.has(item.nodeId) && values.findIndex((candidate) => candidate.nodeId === item.nodeId && candidate.assetType === item.assetType) === index).slice(0, 80)
  };
}
