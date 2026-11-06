import type { AssistantContextSnapshot } from "@/features/assistant/assistantContract";

export type HomeAssistantWorkspace =
  | { kind: "micro"; knowledgeId: string; courseId?: string; pathId: string }
  | { kind: "practice"; courseId: string; assignmentId: string }
  | null;

export type HomeAssistantContextInput = {
  selectedCourseId?: string | null;
  currentKnowledgeId?: string | null;
  selectedPersonId?: string | null;
  workspace: HomeAssistantWorkspace;
  removedContextIds: readonly string[];
};

/**
 * Keep the Assistant request identity in sync with the Home context capsules.
 * Removed capsules contribute nothing; an open workspace contributes only the
 * small identities the server already allows.
 */
export function buildHomeAssistantContext(input: HomeAssistantContextInput): AssistantContextSnapshot {
  const removed = new Set(input.removedContextIds);
  const context: AssistantContextSnapshot = { workspace: "learning", experienceMode: "learn", presentation: "today" };
  const courseVisible = !removed.has("course");
  const knowledgeVisible = !removed.has("knowledge");
  const micro = input.workspace?.kind === "micro" && !removed.has("micro") ? input.workspace : undefined;
  const practice = input.workspace?.kind === "practice" && !removed.has("practice") ? input.workspace : undefined;

  if (courseVisible && input.selectedCourseId) context.courseId = input.selectedCourseId;
  if (micro) {
    context.microPathId = micro.pathId;
    context.knowledgeId = micro.knowledgeId;
    if (micro.courseId) context.courseId = micro.courseId;
  } else if (knowledgeVisible && input.currentKnowledgeId) {
    context.knowledgeId = input.currentKnowledgeId;
  }
  if (practice) {
    context.assignmentId = practice.assignmentId;
    context.courseId = practice.courseId;
  }
  if (!removed.has("person") && input.selectedPersonId) context.selectedObject = `person:${input.selectedPersonId}`;
  return context;
}
