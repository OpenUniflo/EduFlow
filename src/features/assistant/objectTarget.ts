/**
 * One presentation-neutral identity for every object an answer can open.
 *
 * Cards never choose a destination page. They only name the object they show;
 * the surrounding Object Shell decides whether it opens a side panel, grows
 * into an immersive surface, or offers an explicit "open page" action.
 */
export type AssistantObjectTarget =
  | { kind: "route"; courseId: string; chapterId?: string; nodeId?: string }
  | { kind: "material"; courseId: string; materialId: string; segmentId?: string }
  | { kind: "practice"; courseId: string; assignmentId: string; attemptId?: string }
  | { kind: "knowledge"; nodeId: string }
  | { kind: "records" }
  | { kind: "brief"; messageId: string };

/** Stable panel identity, independent of where the panel is rendered. */
export function objectTargetKey(target: AssistantObjectTarget): string {
  switch (target.kind) {
    case "route": return `route:${target.courseId}`;
    case "material": return `material:${target.courseId}:${target.materialId}`;
    case "practice": return `practice:${target.courseId}:${target.assignmentId}`;
    case "knowledge": return `knowledge:${target.nodeId}`;
    case "records": return "records";
    case "brief": return `brief:${target.messageId}`;
  }
}

/** Parse a trusted target that was serialized by this module. */
export function parseAssistantObjectTarget(value: unknown): AssistantObjectTarget | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const string = (key: string) => typeof source[key] === "string" && (source[key] as string).trim() ? String(source[key]).trim() : undefined;
  if (source.kind === "route" && string("courseId")) return { kind: "route", courseId: string("courseId")!, ...(string("chapterId") ? { chapterId: string("chapterId")! } : {}), ...(string("nodeId") ? { nodeId: string("nodeId")! } : {}) };
  if (source.kind === "material" && string("courseId") && string("materialId")) return { kind: "material", courseId: string("courseId")!, materialId: string("materialId")!, ...(string("segmentId") ? { segmentId: string("segmentId")! } : {}) };
  if (source.kind === "practice" && string("courseId") && string("assignmentId")) return { kind: "practice", courseId: string("courseId")!, assignmentId: string("assignmentId")!, ...(string("attemptId") ? { attemptId: string("attemptId")! } : {}) };
  if (source.kind === "knowledge" && string("nodeId")) return { kind: "knowledge", nodeId: string("nodeId")! };
  if (source.kind === "records") return { kind: "records" };
  if (source.kind === "brief" && string("messageId")) return { kind: "brief", messageId: string("messageId")! };
  return null;
}
