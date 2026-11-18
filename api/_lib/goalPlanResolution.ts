import type { SupabaseClient } from "@supabase/supabase-js";
import { noMatchGoalPlan, type GoalPlan } from "../../src/features/course/goal/goalPlanning.js";
import { resolveGoalLanguage, type GoalLanguageResolution } from "./goalLanguageAdapter.js";
import { planLearningGoal } from "./goalPlanningService.js";

export type GoalLanguageInput = {
  goalText: string;
  previousGoalText?: string;
  previousKnowledgeIds?: string[];
  refinement?: string;
  conversationContext?: Array<{ role: string; content: string }>;
};

export type GoalLanguageResolver = (client: SupabaseClient, input: GoalLanguageInput) => Promise<GoalLanguageResolution>;

type ReadyLanguage = Extract<GoalLanguageResolution, { status: "ready" }>;
type ClarificationLanguage = Extract<GoalLanguageResolution, { status: "needs_clarification" }>;
type NoMatchLanguage = Extract<GoalLanguageResolution, { status: "no_match" }>;

export type ResolvedGoalPlan =
  | { status: "needs_clarification"; language: ClarificationLanguage }
  | { status: "no_match"; language: NoMatchLanguage | ReadyLanguage; plan: GoalPlan }
  | { status: "ready"; language: ReadyLanguage; plan: GoalPlan };

/**
 * The one Goal resolution path shared by the explicit `plan-goal` action and
 * the Assistant `planLearningGoal` tool: a single language-adapter call
 * followed by product-owned Knowledge/Course planning. `plan-goal` and the
 * tool therefore cannot drift into different Goal semantics.
 */
export async function resolveGoalPlan(client: SupabaseClient, input: GoalLanguageInput, resolve: GoalLanguageResolver = resolveGoalLanguage): Promise<ResolvedGoalPlan> {
  const language = await resolve(client, input);
  if (language.status === "needs_clarification") return { status: language.status, language };
  if (language.status === "no_match") {
    return { status: "no_match", language, plan: noMatchGoalPlan(language.primaryOutcome, language.reason) };
  }
  const plan = await planLearningGoal(client, language.primaryOutcome, language.candidateKnowledgeIds);
  if (plan.resolution.status === "ready") return { status: "ready", language, plan };
  return { status: "no_match", language, plan };
}
