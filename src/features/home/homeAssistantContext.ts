import type { AssistantContextSnapshot } from "@/features/assistant/assistantContract";
import type { ActiveAssistantObject } from "@/features/assistant/activeObject";

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
  /** The object open in the workspace; it overrides the focus identities. */
  activeObject?: ActiveAssistantObject | null;
  /** False when the learner removed the object context tag. */
  objectContextVisible?: boolean;
};

/**
 * Keep the Assistant request identity in sync with the Home context capsules.
 * Removed capsules contribute nothing; an open workspace contributes only the
 * small identities the server already allows.
 */
export function buildHomeAssistantContext(input: HomeAssistantContextInput): AssistantContextSnapshot {
  const removed = new Set(input.removedContextIds);
  const context: AssistantContextSnapshot = { workspace: "learning", experienceMode: "learn", presentation: "today" };
  // A removed object tag means this turn carries no object identity at all.
  if (input.activeObject && input.objectContextVisible === false) return context;
  if (input.activeObject) {
    if (input.activeObject.kind === "practice") {
      context.courseId = input.activeObject.courseId;
      context.assignmentId = input.activeObject.assignmentId;
      context.presentation = "practice";
    } else if (input.activeObject.kind === "route") {
      context.courseId = input.activeObject.courseId;
      context.presentation = "route";
    } else if (input.activeObject.kind === "knowledge") {
      context.knowledgeId = input.activeObject.nodeId;
      context.presentation = "knowledge";
    } else if (input.activeObject.kind === "material") {
      context.courseId = input.activeObject.courseId;
      context.materialId = input.activeObject.materialId;
      context.presentation = "material";
    } else if (input.activeObject.kind === "records") {
      context.presentation = "records";
    } else if (input.activeObject.kind === "brief") {
      context.presentation = "brief";
    } else {
      context.courseId = input.activeObject.courseId;
      context.knowledgeId = input.activeObject.knowledgeId;
      context.microPathId = input.activeObject.pathId;
      context.presentation = "micro";
    }
    return context;
  }
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
