import { z } from "zod";
import type { StructuredGenerationClient } from "../../src/features/knowledge/generation/types.js";
import { createJsonGenerationClient } from "./llm.js";

const proposalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(600),
  goal: z.string().trim().max(1000).optional(),
  learnerFoundation: z.string().trim().max(500).optional(),
  timeConstraint: z.string().trim().max(300).optional(),
  preferences: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  addKnowledgeIds: z.array(z.string().trim().min(1)).max(1000).optional(),
  removeKnowledgeIds: z.array(z.string().trim().min(1)).max(1000).optional(),
  orderedKnowledgeIds: z.array(z.string().trim().min(1)).max(1000).optional(),
  moves: z.array(z.object({ nodeId: z.string().trim().min(1), chapterId: z.string().trim().min(1) })).max(1000).optional()
});

export type GeneratedCourseCreatorProposal = z.infer<typeof proposalSchema>;

export function parseGeneratedCourseCreatorProposal(value: unknown, allowedKnowledgeIds: ReadonlySet<string>, allowedChapterIds: ReadonlySet<string>) {
  const parsed = proposalSchema.parse(value);
  const knowledgeIds = [
    ...(parsed.addKnowledgeIds ?? []), ...(parsed.removeKnowledgeIds ?? []), ...(parsed.orderedKnowledgeIds ?? []),
    ...(parsed.moves ?? []).map((move) => move.nodeId)
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
    stage: "course-creator-proposal", promptVersion: "course-creator-proposal-v1", schemaVersion: "1", temperature: 0, maxTokens: 1200,
    system: `You are the proposal adapter inside EduFlow's single Course Creator pipeline. Return JSON only. You never mutate or publish. The product validates and the user must explicitly apply. Use only Knowledge IDs and Chapter IDs supplied by the product. Never turn curriculum order into a Knowledge prerequisite. For requirements, propose only goal/foundation/time/preferences. For scope, use addKnowledgeIds/removeKnowledgeIds; add only visible existing Knowledge. For structure, use orderedKnowledgeIds and moves; do not add or remove Knowledge facts. For assets/draft/publish, explain warnings or recommended edits without claiming that missing assets block creation. Output: {"title":"...","summary":"...","goal"?:"...","learnerFoundation"?:"...","timeConstraint"?:"...","preferences"?:[],"addKnowledgeIds"?:[],"removeKnowledgeIds"?:[],"orderedKnowledgeIds"?:[],"moves"?:[]}.`,
    user: JSON.stringify(input)
  });
  const parsed = parseGeneratedCourseCreatorProposal(generated.value, new Set(input.visibleKnowledge.map((item) => item.id)), new Set(input.chapterIds));
  const current = input.current as { scope?: { targetKnowledgeIds?: string[]; prerequisiteKnowledgeIds?: string[]; optionalKnowledgeIds?: string[] } };
  const currentIds = new Set([...(current.scope?.targetKnowledgeIds ?? []), ...(current.scope?.prerequisiteKnowledgeIds ?? []), ...(current.scope?.optionalKnowledgeIds ?? [])]);
  const unique = (ids: string[] | undefined) => [...new Set(ids ?? [])];
  const narrowingScope = input.stage === "scope" && /(?:only|shorter|too much|minimum|保留|太多|缩短|精简|最少|必须)/i.test(input.instruction);
  return {
    ...parsed,
    addKnowledgeIds: narrowingScope ? [] : unique(parsed.addKnowledgeIds).filter((id) => !currentIds.has(id)).slice(0, 20),
    removeKnowledgeIds: unique(parsed.removeKnowledgeIds).filter((id) => currentIds.has(id)).slice(0, 20),
    orderedKnowledgeIds: unique(parsed.orderedKnowledgeIds).filter((id) => currentIds.has(id)).slice(0, 80),
    moves: (parsed.moves ?? []).filter((move, index, values) => currentIds.has(move.nodeId) && values.findIndex((candidate) => candidate.nodeId === move.nodeId) === index).slice(0, 40)
  };
}
