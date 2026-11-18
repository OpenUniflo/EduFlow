import { createContext, useContext } from "react";

/**
 * The one object currently open in the Home workspace. It is presentation
 * identity only: every card and panel still reads the real product state.
 */
export type ActiveAssistantObject =
  | { kind: "practice"; courseId: string; assignmentId: string; title: string }
  | { kind: "route"; courseId: string; title: string }
  | { kind: "micro"; courseId?: string; knowledgeId: string; pathId: string; title: string }
  | { kind: "knowledge"; nodeId: string; title: string }
  | { kind: "material"; courseId: string; materialId: string; title: string }
  | { kind: "records"; title: string }
  | { kind: "brief"; messageId: string; title: string };

export const ActiveAssistantObjectContext = createContext<ActiveAssistantObject | null>(null);

export function useActiveAssistantObject() {
  return useContext(ActiveAssistantObjectContext);
}

export function activeObjectKey(object: ActiveAssistantObject | null): string | null {
  if (!object) return null;
  if (object.kind === "practice") return `practice:${object.courseId}:${object.assignmentId}`;
  if (object.kind === "route") return `route:${object.courseId}`;
  if (object.kind === "knowledge") return `knowledge:${object.nodeId}`;
  if (object.kind === "material") return `material:${object.courseId}:${object.materialId}`;
  if (object.kind === "records") return "records";
  if (object.kind === "brief") return `brief:${object.messageId}`;
  return `micro:${object.pathId}`;
}

export function cardMatchesActiveObject(
  active: ActiveAssistantObject | null,
  card:
    | { kind: "practice"; courseId: string; assignmentId: string }
    | { kind: "route"; courseId: string }
    | { kind: "micro"; pathId: string }
    | { kind: "knowledge"; nodeId: string }
    | { kind: "material"; courseId: string; materialId: string }
    | { kind: "brief"; messageId: string }
): boolean {
  if (!active) return false;
  if (active.kind === "practice" && card.kind === "practice") return active.courseId === card.courseId && active.assignmentId === card.assignmentId;
  if (active.kind === "route" && card.kind === "route") return active.courseId === card.courseId;
  if (active.kind === "micro" && card.kind === "micro") return active.pathId === card.pathId;
  if (active.kind === "knowledge" && card.kind === "knowledge") return active.nodeId === card.nodeId;
  if (active.kind === "material" && card.kind === "material") return active.courseId === card.courseId && active.materialId === card.materialId;
  if (active.kind === "brief" && card.kind === "brief") return active.messageId === card.messageId;
  return false;
}
