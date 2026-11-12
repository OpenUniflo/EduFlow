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

/** The newest Brief created from this exact Course Search message. */
function briefForSearch(messages: readonly AssistantMessage[], searchMessageId: string) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.structuredContent?.type !== "course_creation_brief") continue;
    if (message.structuredContent.planningMessageId === searchMessageId) return { message, content: message.structuredContent };
  }
  return null;
}

function idlePresentation(error?: string): ArchiveAssistantPresentation {
  return {
    state: "idle",
    candidateIds: [],
    targetIds: [],
    prerequisiteIds: [],
    draftIds: [],
    draftDepth: new Map(),
    matchCount: 0,
    ...(error ? { error } : {})
  };
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
  /**
   * `undefined` follows the newest result; a message id shows only the result
   * created by that request; `null` shows nothing while a new request runs.
   */
  planningMessageId?: string | null;
}): ArchiveAssistantPresentation {
  if (input.planningMessageId === null) return idlePresentation(input.error);
  const search = input.planningMessageId
    ? (() => {
        const message = input.messages.find((candidate) => candidate.id === input.planningMessageId && candidate.structuredContent?.type === "course_search");
        return message?.structuredContent?.type === "course_search" ? { message, content: message.structuredContent } : null;
      })()
    : lastStructured<CourseSearchTimelineContent>(input.messages, "course_search");
  const brief = input.planningMessageId
    ? (search ? briefForSearch(input.messages, search.message.id) : null)
    : lastStructured<CourseCreationBrief>(input.messages, "course_creation_brief");
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
    ...(search?.message.id ? { searchMessageId: search.message.id } : {}),
    ...(briefIsNewer && brief?.message.id ? { briefMessageId: brief.message.id } : {}),
    ...(briefIsNewer ? (brief?.content.goal ? { goalText: brief.content.goal } : {}) : (search?.content.goalText ? { goalText: search.content.goalText } : {})),
    ...(search?.content.intentSummary ? { intentSummary: search.content.intentSummary } : {}),
    ...(plan ? { plan } : {}),
    candidateIds,
    targetIds,
    prerequisiteIds,
    ...(briefIsNewer && brief?.content ? { brief: brief.content } : {}),
    draftIds,
    draftDepth,
    matchCount: meaningfulMatches.length,
    ...(input.error ? { error: input.error } : {})
  };
}

export function assistantSuggestedKnowledgeIds(presentation: ArchiveAssistantPresentation) {
  return new Set(presentation.candidateIds);
}
