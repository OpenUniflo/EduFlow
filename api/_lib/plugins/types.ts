import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AssistantContextSnapshot } from "../../../src/features/assistant/assistantContract.js";
import type { AssistantCardRef } from "../../../src/features/assistant/assistantCards.js";

export type AssistantToolDependencies = {
  goalLanguageResolver?: import("../goalPlanResolution.js").GoalLanguageResolver;
  onGoalPlan?: (plan: Awaited<ReturnType<typeof import("../goalPlanningService.js").planLearningGoal>>) => void;
  turnId?: string;
  attachmentSourceIds?: readonly string[];
  links?: readonly string[];
  sessionId?: string;
};

export type AssistantPluginContext = {
  client: SupabaseClient;
  user: User;
  context: AssistantContextSnapshot;
  dependencies: AssistantToolDependencies;
};

export type AssistantPluginCard = {
  cardType: string;
  panel: "assignment" | "route" | "reader" | "records" | "my" | "map";
};

/** Each feature registers its own tools, cards and management panel. */
export type WriteResultData = {
  id: string;
  toolName: string;
  ok: boolean;
  title: string;
  detail?: string;
  card?: AssistantCardRef;
  attemptId?: string;
  evaluationPending?: boolean;
};

/** A plugin declares every tool that changes durable learner state. */
export type WriteToolDefinition = {
  label: string;
  /** Map this tool's structured output (success or failure) to one result part. */
  result(output: unknown): Omit<WriteResultData, "id" | "toolName">;
};

export type AssistantPlugin = {
  id: "planning" | "knowledge" | "micro" | "courses" | "materials" | "progress" | "navigation" | "assignment" | "workspace";
  title: string;
  tools(context: AssistantPluginContext): Record<string, unknown>;
  cards: AssistantPluginCard[];
  writes?: Record<string, WriteToolDefinition>;
};

export const assistantToolId = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export function safeTool<T>(execute: () => Promise<T>) {
  return execute().catch((error) => ({ error: { code: "tool_failed", message: error instanceof Error ? error.message : "Tool failed" } }));
}
