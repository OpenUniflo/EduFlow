import type { RightPanel } from "./rightPanel";

const OBJECT_KEYS = [
  "object",
  "objectCourseId",
  "objectChapterId",
  "objectNodeId",
  "objectMaterialId",
  "objectSegmentId",
  "objectAssignmentId",
  "objectAttemptId",
  "objectMessageId"
] as const;

/**
 * One address for the open right panel. The same parser restores it after a
 * refresh or after returning from an object's dedicated page.
 */
export function rightPanelFromParams(params: URLSearchParams): RightPanel {
  const object = params.get("object");
  const courseId = params.get("objectCourseId") ?? undefined;
  if (object === "route" && courseId) {
    const chapterId = params.get("objectChapterId") ?? undefined;
    const nodeId = params.get("objectNodeId") ?? undefined;
    return { kind: "route", courseId, ...(chapterId ? { chapterId } : {}), ...(nodeId ? { nodeId } : {}) };
  }
  if (object === "practice" && courseId) {
    const assignmentId = params.get("objectAssignmentId") ?? undefined;
    const attemptId = params.get("objectAttemptId") ?? undefined;
    if (assignmentId) return { kind: "practice", courseId, assignmentId, title: "", ...(attemptId ? { attemptId } : {}) };
  }
  if (object === "material" && courseId) {
    const materialId = params.get("objectMaterialId") ?? undefined;
    const segmentId = params.get("objectSegmentId") ?? undefined;
    if (materialId) return { kind: "material", courseId, materialId, ...(segmentId ? { segmentId } : {}) };
  }
  if (object === "knowledge") {
    const nodeId = params.get("objectNodeId") ?? undefined;
    if (nodeId) return { kind: "knowledge", nodeId };
  }
  if (object === "records") return { kind: "records" };
  if (object === "brief") {
    const messageId = params.get("objectMessageId") ?? undefined;
    if (messageId) return { kind: "brief", messageId };
  }
  if (params.get("panel") === "1") return { kind: "my" };
  return { kind: "none" };
}

export function rightPanelParams(params: URLSearchParams, panel: RightPanel): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of OBJECT_KEYS) next.delete(key);
  next.delete("panel");
  switch (panel.kind) {
    case "my": next.set("panel", "1"); break;
    case "route":
      next.set("object", "route");
      next.set("objectCourseId", panel.courseId);
      if (panel.chapterId) next.set("objectChapterId", panel.chapterId);
      if (panel.nodeId) next.set("objectNodeId", panel.nodeId);
      break;
    case "practice":
      next.set("object", "practice");
      next.set("objectCourseId", panel.courseId);
      next.set("objectAssignmentId", panel.assignmentId);
      if (panel.attemptId) next.set("objectAttemptId", panel.attemptId);
      break;
    case "material":
      next.set("object", "material");
      next.set("objectCourseId", panel.courseId);
      next.set("objectMaterialId", panel.materialId);
      if (panel.segmentId) next.set("objectSegmentId", panel.segmentId);
      break;
    case "knowledge":
      next.set("object", "knowledge");
      next.set("objectNodeId", panel.nodeId);
      break;
    case "records": next.set("object", "records"); break;
    case "brief":
      next.set("object", "brief");
      next.set("objectMessageId", panel.messageId);
      break;
    case "micro":
      // The Micro form owns `micro`/`view`/`card`; the panel stack only adds history.
      break;
    case "none": break;
  }
  return next;
}
