import { NAVIGATION_POLICY_VERSION, type NavigationAsset, type NavigationEngineInput, type NavigationNode, type NavigationPathItem, type NavigationPlan } from "../../src/shared/learning/navigation.js";
export { NAVIGATION_POLICY_VERSION } from "../../src/shared/learning/navigation.js";

const byRoute = (left: NavigationNode, right: NavigationNode) => left.lessonOrder - right.lessonOrder || left.coverageOrder - right.coverageOrder || left.id.localeCompare(right.id);
const assetsForNode=(assets:NavigationAsset[],nodeId:string)=>{const matching=assets.filter((asset)=>asset.nodeId===nodeId);const required=matching.filter((asset)=>asset.required);return required.length?required:matching;};
const firstForNode = (assets: NavigationAsset[], nodeId: string) => assetsForNode(assets,nodeId).sort((left, right) => left.order-right.order || left.id.localeCompare(right.id))[0];

/** Pure V1 policy: curriculum ranks candidates; factual prerequisite mastery gates eligibility. */
export function computeNavigationPlan(input: NavigationEngineInput): NavigationPlan {
  const ordered = [...input.nodes].sort(byRoute);
  const titleById = new Map(ordered.map((node) => [node.id, node.title]));
  const prerequisiteIds = new Map<string, string[]>();
  input.prerequisiteEdges.forEach((edge) => prerequisiteIds.set(edge.target, [...(prerequisiteIds.get(edge.target) ?? []), edge.source].sort()));
  const courseNodeIds=new Set(ordered.map((node)=>node.id));
  const outgoing=new Set(input.prerequisiteEdges.filter((edge)=>courseNodeIds.has(edge.source)&&courseNodeIds.has(edge.target)).map((edge)=>edge.source));
  const targets=(input.targetNodeIds.length?input.targetNodeIds:ordered.filter((node)=>!outgoing.has(node.id)).map((node)=>node.id)).filter((id)=>courseNodeIds.has(id));
  const relevant=new Set<string>(); const visit=(id:string)=>{if(relevant.has(id)||!courseNodeIds.has(id))return;relevant.add(id);(prerequisiteIds.get(id)??[]).forEach(visit);};targets.forEach(visit);
  const path = ordered.filter((node)=>relevant.has(node.id)).map((node): NavigationPathItem => {
    if (input.knowledgeStatuses[node.id] === "mastered") return { nodeId: node.id, title: node.title, state: "skipped", blockedBy: [] };
    const unmet = (prerequisiteIds.get(node.id) ?? []).filter((id) => input.knowledgeStatuses[id] !== "mastered");
    if (unmet.length) return { nodeId: node.id, title: node.title, state: "blocked", blockedBy: unmet.map((id) => titleById.get(id) ?? id) };
    return { nodeId: node.id, title: node.title, state: input.knowledgeStatuses[node.id] ? "underway" : "eligible", blockedBy: [] };
  });
  const skippedNodeIds = path.filter((item) => item.state === "skipped").map((item) => item.nodeId);
  const failedNodeIds = new Set(path.flatMap((item)=>assetsForNode(input.assignments,item.nodeId).filter((asset)=>input.assignmentOutcomes[asset.id]==="failed").map(()=>item.nodeId)));
  const current = path.find((item) => failedNodeIds.has(item.nodeId)) ?? path.find((item) => item.state === "underway") ?? path.find((item) => item.state === "eligible") ?? path.find((item)=>item.state==="blocked");
  if (!current) return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: "next", resourceKind: "course", reasonCode: "course_route_complete", reason: "课程路线中的 Knowledge 已全部掌握。" } };

  if(current.state==="blocked")return {policyVersion:NAVIGATION_POLICY_VERSION,courseId:input.courseId,path,skippedNodeIds,nextAction:{kind:"remediation",nodeId:current.nodeId,resourceKind:"course",reasonCode:"prerequisite_mastery_required",reason:`先完成前置 Knowledge：${current.blockedBy.join("、")}。`}};

  const nodeId = current.nodeId;
  const micro = firstForNode(input.microPaths, nodeId);
  const microCompleted = micro ? input.completedMicroPathIds.includes(micro.id) : false;
  const outcomeRank = { failed: 0, pending: 1, passed: 2 } as const;
  const assignment = assetsForNode(input.assignments,nodeId).sort((left, right) => {
    const leftOutcome = input.assignmentOutcomes[left.id]; const rightOutcome = input.assignmentOutcomes[right.id];
    return (leftOutcome ? outcomeRank[leftOutcome] : 3) - (rightOutcome ? outcomeRank[rightOutcome] : 3)
      || left.order-right.order || Number(Boolean(right.required)) - Number(Boolean(left.required)) || left.id.localeCompare(right.id);
  })[0];
  const outcome = assignment ? input.assignmentOutcomes[assignment.id] : undefined;
  const material = firstForNode(input.materials, nodeId);

  if (assignment && outcome === "failed") {
    const review = micro ?? material;
    return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: "remediation", nodeId, resourceKind: review ? (micro ? "micro" : "material") : "assignment", resourceId: review?.id ?? assignment.id, reasonCode: review ? "practice_failed_review" : "practice_failed_retry", reason: review ? "最近一次实训未通过，先复习相关教学内容再重试。" : "最近一次实训未通过，检查反馈后重试。" } };
  }
  if (micro && !microCompleted) {
    const underway = input.knowledgeStatuses[nodeId] != null;
    return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: underway ? "review" : "next", nodeId, resourceKind: "micro", resourceId: micro.id, reasonCode: underway ? "resume_required_micro" : "begin_required_micro", reason: underway ? "继续或复习尚未完成的必修 Micro。" : "从该 Knowledge 的必修 Micro 开始。" } };
  }
  if (assignment && outcome !== "passed") {
    return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: "practice", nodeId, resourceKind: "assignment", resourceId: assignment.id, reasonCode: outcome === "pending" ? "practice_awaiting_review" : "learning_ready_for_practice", reason: outcome === "pending" ? "实训已提交并等待评阅；可查看提交状态。" : "教学活动已完成，现在通过实训证明掌握。" } };
  }
  if (material && !micro && !assignment) {
    return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: "next", nodeId, resourceKind: "material", resourceId: material.id, reasonCode: "material_learning_available", reason: "该 Knowledge 当前以课程 Material 为学习入口。" } };
  }
  return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: "next", nodeId, resourceKind: "course", reasonCode: "knowledge_route_available", reason: assignment && outcome === "passed" ? "实训已通过；继续课程中的下一项 Knowledge。" : "该 Knowledge 当前没有必修学习资产，可沿课程路线继续。" } };
}
