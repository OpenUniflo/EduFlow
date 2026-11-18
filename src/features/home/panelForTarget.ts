import { applicationServices } from "@/app/services/applicationServices";
import type { AssistantObjectTarget } from "@/features/assistant/objectTarget";
import type { RightPanel } from "./rightPanel";

/**
 * One target → panel conversion for both the Home conversation and the
 * page-level floating Assistant. Adding an object kind or a panel kind changes
 * this module, not each host.
 */
export function panelForTarget(target: AssistantObjectTarget): RightPanel {
  if (target.kind === "route") {
    return {
      kind: "route",
      courseId: target.courseId,
      ...(target.chapterId ? { chapterId: target.chapterId } : {}),
      ...(target.nodeId ? { nodeId: target.nodeId } : {})
    };
  }
  if (target.kind === "practice") {
    const assignment = applicationServices.courseRepository.getCourse(target.courseId)?.assignments.find((item) => item.id === target.assignmentId);
    return {
      kind: "practice",
      courseId: target.courseId,
      assignmentId: target.assignmentId,
      title: assignment?.title ?? "动手任务",
      ...(target.attemptId ? { attemptId: target.attemptId } : {})
    };
  }
  if (target.kind === "material") {
    return {
      kind: "material",
      courseId: target.courseId,
      materialId: target.materialId,
      ...(target.segmentId ? { segmentId: target.segmentId } : {})
    };
  }
  if (target.kind === "knowledge") return { kind: "knowledge", nodeId: target.nodeId };
  if (target.kind === "records") return { kind: "records" };
  return { kind: "brief", messageId: target.messageId };
}

