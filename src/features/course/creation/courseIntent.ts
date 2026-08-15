import type { StructuredGenerationClient } from "@/features/knowledge/generation/types";

export type CourseIntent =
  | { status: "ready"; targetOutcome: string }
  | { status: "needs_clarification"; clarificationQuestion: string; recommendedOptions: string[] };

const record = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Course intent must be an object");
  return value as Record<string, unknown>;
};
const nonEmpty = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};

export function parseCourseIntent(value: unknown): CourseIntent {
  const item = record(value);
  const status = nonEmpty(item.status, "status");
  if (status === "ready") return { status, targetOutcome: nonEmpty(item.targetOutcome, "targetOutcome") };
  if (status !== "needs_clarification") throw new Error("status is unsupported");
  if (!Array.isArray(item.recommendedOptions) || item.recommendedOptions.length < 3 || item.recommendedOptions.length > 5) throw new Error("recommendedOptions must contain 3 to 5 options");
  const recommendedOptions = item.recommendedOptions.map((option, index) => nonEmpty(option, `recommendedOptions[${index}]`));
  return { status, clarificationQuestion: nonEmpty(item.clarificationQuestion, "clarificationQuestion"), recommendedOptions };
}

export async function analyzeCourseIntent(input: { message: string; context?: string; materialNames?: string[] }, client: StructuredGenerationClient) {
  if (!input.message.trim() && !input.materialNames?.length) throw new Error("Course intent requires a message or material context");
  const result = await client.generateJson({
    stage: "course-intent", promptVersion: "course-intent-v1", schemaVersion: "course-intent-v1", maxTokens: 1_200, temperature: 0.1,
    system: "Extract the user's final learner outcome for course creation. Return JSON only. A topic, source material, duration, or request to create a course is not by itself a final outcome. If the learner's observable end capability or artifact is clear, return ready with one concise targetOutcome faithful to the user. Otherwise ask one focused clarification question and provide 3 to 5 short options tailored to the supplied topic/material context. Do not use topic-specific hardcoded defaults.",
    user: JSON.stringify({ schema: { ready: { status: "ready", targetOutcome: "string" }, clarification: { status: "needs_clarification", clarificationQuestion: "string", recommendedOptions: ["3 to 5 contextual choices"] } }, message: input.message, context: input.context, materialNames: input.materialNames })
  });
  return { intent: parseCourseIntent(result.value), metadata: result.metadata };
}
