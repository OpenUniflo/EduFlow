import { readPersonalCourseRoute } from "./personalCourseRoute.js";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase.js";
import { dataOrThrow } from "./query.js";
import { requirePublishedCourse } from "./courseMembership.js";
import { recommend } from "./recommendation.js";
import { readLearningData, readPathCriterionMappings } from "./learningData.js";
import { CRITERION_ESTIMATOR_VERSION } from "../../src/shared/learning/criterionState.js";
import type { NavigationAsset, NavigationEngineInput, NavigationKnowledgeStatus } from "../../src/shared/learning/navigation.js";
import { buildFirstSegment, type AssignmentProgressStatus } from "../../src/shared/learning/firstSegment.js";
import { applyMainlineNext } from "../../src/shared/learning/mainlineNext.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
type RangeQuery = { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { code?: string; message: string } | null }> };

export async function fetchAllNavigationRows(query: RangeQuery, label: string) {
  const rows: Row[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await query.range(from, from + pageSize - 1);
    const page = dataOrThrow(result.data as Row[] | null, result.error as never, label);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function fetchNavigationRowsByChunks(values: string[], queryForChunk: (chunk: string[]) => RangeQuery, label: string) {
  const rows: Row[] = [];
  const uniqueValues = [...new Set(values)].sort();
  const maximumIds = 100;
  const maximumEncodedCharacters = 4_000;
  let chunk: string[] = [];
  let encodedCharacters = 0;
  for (const value of uniqueValues) {
    const encodedSize = encodeURIComponent(value).length + 3;
    if (chunk.length && (chunk.length >= maximumIds || encodedCharacters + encodedSize > maximumEncodedCharacters)) {
      rows.push(...await fetchAllNavigationRows(queryForChunk(chunk), label));
      chunk = [];
      encodedCharacters = 0;
    }
    chunk.push(value);
    encodedCharacters += encodedSize;
  }
  if (chunk.length) rows.push(...await fetchAllNavigationRows(queryForChunk(chunk), label));
  return rows;
}

/**
 * The single deterministic Navigation Engine read used by GET /api/navigation
 * and the Assistant navigation tool. Learner identity is always the
 * authenticated user; the published Course is revalidated here so no caller
 * can read an invisible Course's decision.
 */
export async function readNavigationDecision(client: SupabaseClient, userId: string, courseId: string) {
  await requirePublishedCourse(client, courseId);
  const server = createServerSupabase();
  const [personal, courseMicro, assignmentRows, assignmentCoverageRows, materialsRows, materialCoverageRows] = await Promise.all([
    readPersonalCourseRoute(client, userId, courseId),
    fetchAllNavigationRows(client.from("micro_learning_paths").select("id,knowledge_id,required").eq("course_id", courseId).eq("status", "published").eq("mode", "learn").order("knowledge_id").order("id"), "Course Micro navigation lookup"),
    fetchAllNavigationRows(client.from("course_assignments").select("id,display_order").eq("course_id", courseId).order("display_order").order("id"), "Navigation Assignment lookup"),
    fetchAllNavigationRows(client.from("assignment_coverages").select("id,assignment_id,node_id,required").eq("course_id", courseId).order("assignment_id").order("node_id").order("id"), "Navigation Assignment coverage lookup"),
    fetchAllNavigationRows(client.from("materials").select("id,display_order").eq("course_id", courseId).order("display_order").order("id"), "Navigation Materials order lookup"),
    fetchAllNavigationRows(client.from("material_knowledge_coverages").select("id,material_id,node_id").eq("course_id", courseId).order("material_id").order("node_id").order("id"), "Navigation Material lookup")
  ]);
  const { route, nodes, states } = personal;
  const courseNodeIds = new Set(route.orderedNodeIds);
  const nodeIds = route.orderedNodeIds;
  const assignmentIds = assignmentRows.map((row) => text(row, "id"));
  const [globalMicro, allResultHistory, withdrawnAttemptRows] = await Promise.all([
    fetchNavigationRowsByChunks(nodeIds, (chunk) => client.from("micro_learning_paths").select("id,knowledge_id,required").is("course_id", null).eq("scope", "global").eq("status", "published").eq("mode", "learn").in("knowledge_id", chunk).order("knowledge_id").order("id"), "Global Micro navigation lookup"),
    fetchNavigationRowsByChunks(assignmentIds, (chunk) => client.from("performance_results").select("id,attempt_id,assignment_id,outcome,evaluated_at,version").eq("user_id", userId).eq("course_id", courseId).in("assignment_id", chunk).order("evaluated_at", { ascending: false }).order("version", { ascending: false }).order("id", { ascending: false }), "Navigation PerformanceResult lookup"),
    fetchNavigationRowsByChunks(assignmentIds, (chunk) => client.from("learning_attempts").select("id,assignment_id").eq("user_id", userId).eq("course_id", courseId).in("assignment_id", chunk).not("withdrawn_at", "is", null).order("id"), "Navigation withdrawn Attempt lookup")
  ]);
  // A withdrawn Attempt never supplies an Assignment outcome to navigation.
  const withdrawnAttemptIds = new Set(withdrawnAttemptRows.map((row) => text(row, "id")));
  const resultHistory = allResultHistory.filter((row) => !withdrawnAttemptIds.has(text(row, "attempt_id")));
  const revisionIds = nodes.map((row) => text(row, "current_revision_id"));
  const revisions = await fetchNavigationRowsByChunks(revisionIds, (chunk) => client.from("knowledge_node_revisions").select("id,title").in("id", chunk).order("id"), "Navigation Knowledge title lookup");
  const titleByRevision = new Map(revisions.map((row) => [text(row, "id"), text(row, "title")]));
  const courseMicroNodeIds = new Set(courseMicro.map((row) => text(row, "knowledge_id")));
  const preferredMicroRows: Array<Row & { navigation_order: number }> = [...courseMicro.map((row): Row & { navigation_order: number } => ({ ...row, navigation_order: 0 })), ...globalMicro.filter((row) => courseNodeIds.has(text(row, "knowledge_id")) && !courseMicroNodeIds.has(text(row, "knowledge_id"))).map((row): Row & { navigation_order: number } => ({ ...row, navigation_order: 1 }))];
  const microPaths = preferredMicroRows.map((row): NavigationAsset => ({ id: text(row, "id"), nodeId: text(row, "knowledge_id"), order: row.navigation_order, required: Boolean(row.required) }));
  const completedMicroRows = await fetchNavigationRowsByChunks(microPaths.map((path) => path.id), (chunk) => client.from("user_micro_path_progress").select("path_id,status").eq("user_id", userId).eq("status", "completed").in("path_id", chunk).order("path_id"), "Navigation Micro progress lookup");
  const assignmentOrder = new Map(assignmentRows.map((row) => [text(row, "id"), Number(row.display_order)]));
  const assignments = assignmentCoverageRows
    .sort((left, right) => {
      const orderDifference = (assignmentOrder.get(text(left, "assignment_id")) ?? 0)
        - (assignmentOrder.get(text(right, "assignment_id")) ?? 0);
      return orderDifference
        || text(left, "assignment_id").localeCompare(text(right, "assignment_id"))
        || text(left, "node_id").localeCompare(text(right, "node_id"));
    })
    .map((row): NavigationAsset => ({
      id: text(row, "assignment_id"),
      nodeId: text(row, "node_id"),
      order: assignmentOrder.get(text(row, "assignment_id")) ?? 0,
      required: Boolean(row.required)
    }));
  const outcomes: NavigationEngineInput["assignmentOutcomes"] = {};
  resultHistory.forEach((row) => { const id = text(row, "assignment_id"); if (!outcomes[id]) outcomes[id] = text(row, "outcome") as "passed" | "failed" | "pending"; });
  const input: NavigationEngineInput = {
    courseId,
    targetNodeIds: route.effectiveTargetNodeIds,
    personalRoute: { orderedNodeIds: route.orderedNodeIds, bridgeKnowledgeIds: route.bridgeKnowledgeIds },
    nodes: nodes.map(row => ({ id: text(row, "id"), title: titleByRevision.get(text(row, "current_revision_id")) ?? text(row, "id"), lessonOrder: 0, coverageOrder: 0 })),
    prerequisiteEdges: route.prerequisiteEdges,
    knowledgeStatuses: Object.fromEntries(states.map((row) => [text(row, "node_id"), text(row, "status") as NavigationKnowledgeStatus])),
    microPaths,
    completedMicroPathIds: completedMicroRows.map((row) => text(row, "path_id")),
    assignments,
    assignmentOutcomes: outcomes,
    materials: (() => { const order = new Map(materialsRows.map((row) => [text(row, "id"), Number(row.display_order)])); return materialCoverageRows.map((row) => ({ id: text(row, "material_id"), nodeId: text(row, "node_id"), order: order.get(text(row, "material_id")) ?? 0 })); })()
  };
  const [learningData, mappings, policyResult] = await Promise.all([
    readLearningData(client, userId, nodeIds),
    readPathCriterionMappings(client, microPaths.map(path => path.id)),
    server.from("course_recommendation_policies").select("policy_key").eq("course_id", courseId).maybeSingle(),
  ]);
  const setting = dataOrThrow(policyResult.data as Row | null, policyResult.error, "Recommendation policy lookup");
  const recommendation = recommend(input, learningData.states, mappings, setting?.policy_key);
  const { policy, candidates, selection } = recommendation;
  const basePlan = {
    ...recommendation.baseline, nextAction: selection.selectedAction
      ? { ...selection.selectedAction.navigationAction, reasonCode: selection.reasonCode, reason: selection.reason }
      : recommendation.baseline.nextAction
  };
  // One shared first-segment rule for /api/navigation, the Assistant tool,
  // candidate snapshots and every Home surface. The rule only moves the real
  // opening Assignment ahead of the next Micro; it never invents a task.
  const orderedNodeIds = input.personalRoute?.orderedNodeIds ?? input.nodes.map((node) => node.id);
  const titleById = new Map(input.nodes.map((node) => [node.id, node.title]));
  const microByNode = new Map(input.microPaths.map((path) => [path.nodeId, { pathId: path.id, title: titleById.get(path.nodeId) ?? path.nodeId }]));
  const practiceByNode = new Map<string, { assignmentId: string; title: string }>();
  for (const assignment of [...input.assignments].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))) {
    if (!practiceByNode.has(assignment.nodeId)) practiceByNode.set(assignment.nodeId, { assignmentId: assignment.id, title: assignment.id });
  }
  const assignmentStatus = new Map<string, AssignmentProgressStatus>(Object.entries(input.assignmentOutcomes).flatMap(([id, outcome]) => {
    const status: AssignmentProgressStatus | undefined = outcome === "passed" ? "accepted" : outcome === "failed" ? "needs_revision" : outcome === "pending" ? "submitted" : undefined;
    return status ? [[id, status] as const] : [];
  }));
  const firstSegment = buildFirstSegment({
    orderedNodeIds,
    microByNode,
    practiceByNode,
    knowledgeStatusByNode: new Map(Object.entries(input.knowledgeStatuses).filter((entry): entry is [string, Exclude<NavigationKnowledgeStatus, undefined>] => Boolean(entry[1]))),
    assignmentStatusByAssignment: assignmentStatus
  });
  const plan = applyMainlineNext(basePlan, firstSegment);
  const nextActionSource = plan.nextAction === basePlan.nextAction ? "navigation" as const : "first_segment" as const;
  const canonicalInput = {
    ...input,
    targetNodeIds: [...input.targetNodeIds].sort(),
    nodes: [...input.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    prerequisiteEdges: [...input.prerequisiteEdges].sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)),
    knowledgeStatuses: Object.fromEntries(Object.entries(input.knowledgeStatuses).sort(([left], [right]) => left.localeCompare(right))),
    microPaths: [...input.microPaths].sort((left, right) => `${left.nodeId}:${left.id}`.localeCompare(`${right.nodeId}:${right.id}`)),
    completedMicroPathIds: [...input.completedMicroPathIds].sort(),
    assignments: [...input.assignments].sort((left, right) => `${left.nodeId}:${left.id}`.localeCompare(`${right.nodeId}:${right.id}`)),
    assignmentOutcomes: Object.fromEntries(Object.entries(input.assignmentOutcomes).sort(([left], [right]) => left.localeCompare(right))),
    mainlineNextAction: plan.nextAction,
    materials: [...input.materials].sort((left, right) => `${left.nodeId}:${left.id}`.localeCompare(`${right.nodeId}:${right.id}`))
  };
  const inputHash = createHash("sha256").update(JSON.stringify({ input: canonicalInput, states: learningData.states, evidenceCutoff: learningData.cutoff, candidates, policy: policy.key, policyVersion: policy.version })).digest("hex");
  const write = await server.from("navigation_decisions").upsert({
    user_id: userId, course_id: courseId, policy_version: plan.policyVersion, input_hash: inputHash, path: plan.path, next_action: plan.nextAction, reason_code: plan.nextAction.reasonCode,
    recommendation_policy: policy.key, recommendation_version: policy.version, candidate_set: candidates,
    selected_action: selection.selectedAction, state_snapshot: learningData.states, state_hash: learningData.stateHash,
    evidence_cutoff: learningData.cutoff, estimator_version: CRITERION_ESTIMATOR_VERSION
  }, { onConflict: "user_id,course_id,policy_version,input_hash", ignoreDuplicates: true });
  dataOrThrow(write.data, write.error, "NavigationDecision write");
  const decisionResult = await server.from("navigation_decisions").select("id,decided_at").eq("user_id", userId).eq("course_id", courseId).eq("policy_version", plan.policyVersion).eq("input_hash", inputHash).single();
  const decision = dataOrThrow(decisionResult.data as Row | null, decisionResult.error, "NavigationDecision readback");
  return {
    decisionId: text(decision, "id"), decidedAt: text(decision, "decided_at"), ...plan, nextActionSource,
    recommendationPolicy: policy.key, recommendationVersion: policy.version, candidates, selectedAction: selection.selectedAction,
    criterionStates: learningData.states, stateHash: learningData.stateHash, evidenceCutoff: learningData.cutoff
  };
}
