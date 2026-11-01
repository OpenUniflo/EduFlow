import type { RouteConflict } from "@/shared/learning/routePlanning";

export type RouteConflictCopy = {
  /** Concrete object line: target / Include name, or the graph itself. */
  heading: string;
  /** What failed and the next executable step for this conflict. */
  reason: string;
  /** A constraint the learner can remove to unblock the planner. */
  removeNodeId?: string;
  /** A target the learner can exclude to unblock the planner. */
  excludeTargetNodeId?: string;
  /** A concrete node the learner can locate in the scene. */
  locateNodeId?: string;
};

/**
 * Single deterministic copy source for route conflicts. It never invents a
 * route fact; it only names the structured conflict object and offers the
 * matching explicit constraint edit.
 */
export function routeConflictCopy(conflict: RouteConflict, title: (id: string) => string): RouteConflictCopy {
  const root = conflict.rootNodeId;
  const node = conflict.nodeId;
  const heading = root
    ? `${conflict.rootKind === "include" ? "无法加入" : "目标当前不可达"}：${title(root)}`
    : "知识前置关系存在循环";
  switch (conflict.kind) {
    case "include_exclude":
      return {
        heading,
        reason: `同一能力不能同时加入和排除；请移除 ${node ? title(node) : "其中一项"} 的约束后重新预览。`,
        removeNodeId: node ?? root,
        locateNodeId: node,
      };
    case "include_outside_model":
      return {
        heading,
        reason: "该能力不在当前项目能力模型中；请撤销“必须经过”，或先调整课程目标后重新预览。",
        removeNodeId: root,
        locateNodeId: root,
      };
    case "target_without_acquired_path":
      return {
        heading,
        reason: "当前没有从任何起点通向此目标的真实前置路径；可排除此目标，或联系课程维护者修复前置关系。",
        excludeTargetNodeId: root,
        locateNodeId: root,
      };
    case "excluded_hard_prerequisite":
      return {
        heading,
        reason: `${node ? title(node) : "该必须前置"} 是必须前置，但被当前路线排除；请撤销该排除后重新预览。`,
        removeNodeId: node,
        locateNodeId: node,
      };
    case "unavailable_hard_prerequisite":
      return {
        heading,
        reason: `${node ? title(node) : "该必须前置"} 是必须前置，但当前不可用；可排除受影响目标，或联系课程维护者修复。`,
        excludeTargetNodeId: root,
        locateNodeId: node,
      };
    case "hard_prerequisite_outside_path":
      return {
        heading,
        reason: `${root ? title(root) : "该目标"} 需要的前置关系 ${node ? title(node) : "未知能力"} → ${root ? title(root) : "未知目标"} 不属于当前有效目标路径；请撤销该目标的加入或选择其他支路，不能绕过这个前置条件。`,
        removeNodeId: conflict.rootKind === "include" ? root : undefined,
        excludeTargetNodeId: conflict.rootKind === "include" ? undefined : root,
        locateNodeId: node,
      };
    default:
      return {
        heading,
        reason: "请联系课程维护者修正真实前置关系后再规划。",
      };
  }
}
