import type { AssistantMessage, CourseCreationBrief, CourseSearchTimelineContent } from "@/features/assistant/assistantContract";
import type { GoalPlan } from "@/features/course/goal/goalPlanning";
import type { ArchiveEdge, ArchiveModel } from "./atlasModel";

export type ArchiveAssistantPresentation = {
  state: "idle" | "searching" | "results" | "brief";
  searchMessageId?: string;
  briefMessageId?: string;
  goalText?: string;
  intentSummary?: string;
  plan?: GoalPlan;
  candidateIds: string[];
  targetIds: string[];
  prerequisiteIds: string[];
  brief?: CourseCreationBrief;
  draftIds: string[];
  draftDepth: Map<string, number>;
  matchCount: number;
  error?: string;
};

function lastStructured<T extends AssistantMessage["structuredContent"]>(messages: readonly AssistantMessage[], type: NonNullable<T>["type"]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.structuredContent?.type === type) return { message, content: message.structuredContent } as { message: AssistantMessage; content: Extract<NonNullable<T>, { type: typeof type }> };
  }
  return null;
}

/** Prerequisite distance from the brief's target Knowledge, using real edges only. */
export function draftDepthByTarget(targetIds: readonly string[], edges: readonly Pick<ArchiveEdge, "source" | "target" | "relation">[]) {
  const prerequisitesByTarget = new Map<string, string[]>();
  edges.filter((edge) => edge.relation === "prerequisite").forEach((edge) => {
    prerequisitesByTarget.set(edge.target, [...(prerequisitesByTarget.get(edge.target) ?? []), edge.source]);
  });
  const depth = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = targetIds.map((id) => ({ id, depth: 0 }));
  while (queue.length) {
    const current = queue.shift()!;
    if (depth.has(current.id) && (depth.get(current.id) ?? 99) <= current.depth) continue;
    depth.set(current.id, current.depth);
    (prerequisitesByTarget.get(current.id) ?? []).sort().forEach((id) => queue.push({ id, depth: current.depth + 1 }));
  }
  return depth;
}

export function deriveAssistantPresentation(input: {
  messages: readonly AssistantMessage[];
  model: ArchiveModel;
  sending: boolean;
  error?: string;
}): ArchiveAssistantPresentation {
  const search = lastStructured<CourseSearchTimelineContent>(input.messages, "course_search");
  const brief = lastStructured<CourseCreationBrief>(input.messages, "course_creation_brief");
  const briefIsNewer = Boolean(brief && (!search || input.messages.indexOf(brief.message) > input.messages.indexOf(search.message)));
  const plan = search?.content.plan;
  const targetIds = briefIsNewer && brief ? brief.content.targetKnowledge.map((item) => item.id) : plan?.resolution.targetKnowledge.map((item) => item.id) ?? [];
  const prerequisiteIds = briefIsNewer ? [] : plan?.prerequisiteKnowledge.map((item) => item.id) ?? [];
  const candidateIds = Array.from(new Set([...targetIds, ...prerequisiteIds])).slice(0, 8);
  const draftIds = briefIsNewer && brief ? brief.content.targetKnowledge.map((item) => item.id) : [];
  const draftDepth = draftDepthByTarget(draftIds, input.model.edges);
  const meaningfulMatches = plan?.matches.filter((match) => match.targetCoverage > 0 || match.requiredCoverage > 0) ?? [];
  const state = briefIsNewer ? "brief" : input.sending ? "searching" : search ? "results" : "idle";
  return {
    state,
    searchMessageId: search?.message.id,
    briefMessageId: briefIsNewer ? brief?.message.id : undefined,
    goalText: briefIsNewer ? brief?.content.goal : search?.content.goalText,
    intentSummary: search?.content.intentSummary,
    plan,
    candidateIds,
    targetIds,
    prerequisiteIds,
    brief: briefIsNewer ? brief?.content : undefined,
    draftIds,
    draftDepth,
    matchCount: meaningfulMatches.length,
    error: input.error
  };
}

export function assistantSuggestedKnowledgeIds(presentation: ArchiveAssistantPresentation) {
  return new Set(presentation.candidateIds);
}
