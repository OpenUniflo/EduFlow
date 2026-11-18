import type { SupabaseClient, User } from "@supabase/supabase-js";
import { dataOrThrow } from "./query.js";
import { readNavigationDecision } from "./navigationDecision.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);

export type LearnerFacts = {
  started: boolean;
  activeCourses: Array<{ courseId: string; title: string }>;
  knowledge: { learning: number; learned: number; practicing: number; mastered: number };
  recentCourse?: { courseId: string; title: string; recentLessonId?: string; nextAction?: string };
  hasAnyRecord: boolean;
};

/**
 * A real, read-only snapshot of the learner's authoritative facts. It is not a
 * card menu: the model chooses cards from the component directory and finds
 * objects through read tools.
 */
export async function buildAssistantLearnerFacts(client: SupabaseClient, user: User): Promise<LearnerFacts> {
  const [activeResult, knowledgeResult] = await Promise.all([
    client.from("user_course_states").select("course_id,is_active,recent_lesson_id,updated_at").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(8),
    client.from("user_knowledge_states").select("node_id,status").eq("user_id", user.id).limit(500)
  ]);
  const activeStates = dataOrThrow(activeResult.data as Row[] | null, activeResult.error, "Assistant active Course facts") ?? [];
  const knowledgeRows = dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "Assistant Knowledge facts") ?? [];
  const counts = { learning: 0, learned: 0, practicing: 0, mastered: 0 };
  for (const row of knowledgeRows) {
    const status = text(row, "status");
    if (status in counts) counts[status as keyof typeof counts] += 1;
  }
  const activeIds = activeStates.map((row) => text(row, "course_id"));
  const titles = new Map<string, string>();
  if (activeIds.length) {
    const titleResult = await client.from("courses").select("id,title").in("id", activeIds);
    for (const row of dataOrThrow(titleResult.data as Row[] | null, titleResult.error, "Assistant Course titles")) {
      titles.set(text(row, "id"), text(row, "title"));
    }
  }
  const activeCourses = activeStates.flatMap((row) => {
    const courseId = text(row, "course_id");
    const title = titles.get(courseId);
    return title ? [{ courseId, title }] : [];
  });
  const facts: LearnerFacts = {
    started: activeStates.length > 0 || knowledgeRows.length > 0,
    activeCourses,
    knowledge: counts,
    hasAnyRecord: knowledgeRows.length > 0
  };
  const recent = activeCourses[0];
  if (recent) {
    let nextAction: string | undefined;
    try {
      const decision = await readNavigationDecision(client, user.id, recent.courseId);
      nextAction = decision.nextAction.reason;
    } catch {
      // Navigation is optional for the fact snapshot; the tool remains authoritative.
    }
    const recentState = activeStates.find((row) => text(row, "course_id") === recent.courseId);
    facts.recentCourse = {
      courseId: recent.courseId,
      title: recent.title,
      ...(recentState && recentState.recent_lesson_id != null ? { recentLessonId: text(recentState, "recent_lesson_id") } : {}),
      ...(nextAction ? { nextAction } : {})
    };
  }
  return facts;
}

export function learnerFactsPrompt(facts: LearnerFacts) {
  return [
    "REAL LEARNER FACTS (authoritative; never claim more than a tool or these facts show):",
    JSON.stringify({
      started: facts.started,
      activeCourses: facts.activeCourses,
      knowledge: facts.knowledge,
      recentCourse: facts.recentCourse ?? null
    }),
    "If started is false, never say the learner is studying, has studied, or has a current course. If started is true, answer progress questions from these facts, not from a missing courseId.",
    "A learner statement such as '我已经学过 Agent' is a claim, not a learning record. Acknowledge it, record nothing, and never say required prerequisites can be skipped."
  ].join("\n");
}
