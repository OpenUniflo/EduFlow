import { satisfiesTeachingPrerequisite } from "../../src/shared/learning/teachingPrerequisites.js";
import { NAVIGATION_POLICY_VERSION, type NavigationAsset, type NavigationEngineInput, type NavigationNode, type NavigationPathItem, type NavigationPlan } from "../../src/shared/learning/navigation.js";
export { NAVIGATION_POLICY_VERSION } from "../../src/shared/learning/navigation.js";

const byRoute = (left: NavigationNode, right: NavigationNode) => left.lessonOrder - right.lessonOrder || left.coverageOrder - right.coverageOrder || left.id.localeCompare(right.id);
const assetsForNode=(assets:NavigationAsset[],nodeId:string)=>{const matching=assets.filter((asset)=>asset.nodeId===nodeId);const required=matching.filter((asset)=>asset.required);return required.length?required:matching;};

/** Instructional policy: curriculum ranks candidates; Course-local teaching prerequisites gate eligibility. */
export function computeNavigationPlan(input: NavigationEngineInput): NavigationPlan {
  const ordered = [...input.nodes].sort(byRoute);
  const titleById = new Map(ordered.map((node) => [node.id, node.title]));
  const prerequisiteIds = new Map<string, string[]>();
  const courseNodeIds=new Set(ordered.map((node)=>node.id));
  input.prerequisiteEdges.filter((edge)=>courseNodeIds.has(edge.source)&&courseNodeIds.has(edge.target)).forEach((edge) => prerequisiteIds.set(edge.target, [...(prerequisiteIds.get(edge.target) ?? []), edge.source].sort()));
  const outgoing=new Set(input.prerequisiteEdges.filter((edge)=>courseNodeIds.has(edge.source)&&courseNodeIds.has(edge.target)).map((edge)=>edge.source));
  const targets=(input.targetNodeIds.length?input.targetNodeIds:ordered.filter((node)=>!outgoing.has(node.id)).map((node)=>node.id)).filter((id)=>courseNodeIds.has(id));
  const relevant=new Set<string>(); const visit=(id:string)=>{if(relevant.has(id)||!courseNodeIds.has(id))return;relevant.add(id);(prerequisiteIds.get(id)??[]).forEach(visit);};targets.forEach(visit);
  const path = ordered.filter((node)=>relevant.has(node.id)).map((node): NavigationPathItem => {
    if (input.knowledgeStatuses[node.id] === "mastered") return { nodeId: node.id, title: node.title, state: "skipped", blockedBy: [] };
    const incompleteMicro = assetsForNode(input.microPaths, node.id).some((asset) => asset.required && !input.completedMicroPathIds.includes(asset.id));
    if (satisfiesTeachingPrerequisite(input.knowledgeStatuses[node.id]) && !incompleteMicro) return { nodeId: node.id, title: node.title, state: "learned", blockedBy: [] };
    const unmet = (prerequisiteIds.get(node.id) ?? []).filter((id) => !satisfiesTeachingPrerequisite(input.knowledgeStatuses[id]));
    if (unmet.length && !satisfiesTeachingPrerequisite(input.knowledgeStatuses[node.id])) return { nodeId: node.id, title: node.title, state: "blocked", blockedBy: unmet.map((id) => titleById.get(id) ?? id) };
    return { nodeId: node.id, title: node.title, state: input.knowledgeStatuses[node.id] && input.knowledgeStatuses[node.id] !== "explore" ? "underway" : "eligible", blockedBy: [] };
  });
  const skippedNodeIds = path.filter((item) => item.state === "skipped").map((item) => item.nodeId);
  const current = path.find((item) => item.state === "underway") ?? path.find((item) => item.state === "eligible") ?? path.find((item)=>item.state==="blocked");
  if (!current) return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: "next", resourceKind: "course", reasonCode: path.length ? "course_route_complete" : "course_route_empty", reason: path.length ? "当前课程学习内容已完成。" : "当前课程尚未准备学习路线。" } };

  if(current.state==="blocked")return {policyVersion:NAVIGATION_POLICY_VERSION,courseId:input.courseId,path,skippedNodeIds,nextAction:{kind:"remediation",nodeId:current.nodeId,resourceKind:"course",reasonCode:"teaching_prerequisite_required",reason:`先完成前置 Knowledge：${current.blockedBy.join("、")}。`}};

  const nodeId = current.nodeId;
  const micro = assetsForNode(input.microPaths, nodeId).filter((asset) => !input.completedMicroPathIds.includes(asset.id)).sort((left, right) => left.order-right.order || left.id.localeCompare(right.id))[0];

  if (micro) {
    const underway = input.knowledgeStatuses[nodeId] != null && input.knowledgeStatuses[nodeId] !== "explore";
    return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: underway ? "review" : "next", nodeId, resourceKind: "micro", resourceId: micro.id, reasonCode: underway ? "resume_required_micro" : "begin_required_micro", reason: underway ? "继续或复习尚未完成的必修 Micro。" : "从该 Knowledge 的必修 Micro 开始。" } };
  }
  return { policyVersion: NAVIGATION_POLICY_VERSION, courseId: input.courseId, path, skippedNodeIds, nextAction: { kind: "next", nodeId, resourceKind: "course", reasonCode: "learning_content_unavailable", reason: "这一学习节点尚未准备可执行学习内容。" } };
}
