import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { requirePublishedCourse } from "../_lib/courseMembership.js";
import { computeNavigationPlan } from "../_lib/navigationEngine.js";
import type { NavigationAsset, NavigationEngineInput, NavigationKnowledgeStatus } from "../../src/shared/learning/navigation.js";

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

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const { client, user } = await createUserSupabase(request);
  const courseId = typeof request.query.courseId === "string" ? request.query.courseId : "";
  if (!courseId) throw new ApiError(400, "course_id_required", "courseId is required");
  await requirePublishedCourse(client, courseId);

  const [coverages, lessons, targets, courseMicro, assignmentRows, assignmentCoverageRows, materialsRows, materialCoverageRows] = await Promise.all([
    fetchAllNavigationRows(client.from("curriculum_coverages").select("id,node_id,lesson_id,display_order").eq("course_id", courseId).order("lesson_id").order("display_order").order("id"), "Navigation coverage lookup"),
    fetchAllNavigationRows(client.from("curriculum_lessons").select("id,display_order").eq("course_id", courseId).order("display_order").order("id"), "Navigation lesson lookup"),
    fetchAllNavigationRows(client.from("course_target_knowledge").select("knowledge_id,required").eq("course_id",courseId).eq("required",true).order("knowledge_id"), "Navigation Course targets lookup"),
    fetchAllNavigationRows(client.from("micro_learning_paths").select("id,knowledge_id,required").eq("course_id", courseId).eq("status", "published").eq("mode", "learn").order("knowledge_id").order("id"), "Course Micro navigation lookup"),
    fetchAllNavigationRows(client.from("course_assignments").select("id,display_order").eq("course_id", courseId).order("display_order").order("id"), "Navigation Assignment lookup"),
    fetchAllNavigationRows(client.from("assignment_coverages").select("id,assignment_id,node_id,required").eq("course_id", courseId).order("assignment_id").order("node_id").order("id"), "Navigation Assignment coverage lookup"),
    fetchAllNavigationRows(client.from("materials").select("id,display_order").eq("course_id",courseId).order("display_order").order("id"), "Navigation Materials order lookup"),
    fetchAllNavigationRows(client.from("material_knowledge_coverages").select("id,material_id,node_id").eq("course_id", courseId).order("material_id").order("node_id").order("id"), "Navigation Material lookup")
  ]);
  const courseNodeIds = new Set(coverages.map((row) => text(row, "node_id")));
  if (!courseNodeIds.size) throw new ApiError(422, "course_route_empty", "Course has no Knowledge route");
  const nodeIds = [...courseNodeIds].sort();
  const assignmentIds = assignmentRows.map((row) => text(row, "id"));
  const [nodes, edges, states, globalMicro, resultHistory] = await Promise.all([
    fetchNavigationRowsByChunks(nodeIds, (chunk) => client.from("knowledge_nodes").select("id,current_revision_id").in("id", chunk).order("id"), "Navigation Knowledge lookup"),
    fetchNavigationRowsByChunks(nodeIds, (chunk) => client.from("knowledge_edges").select("id,source_node_id,target_node_id,relation").eq("relation", "prerequisite").eq("lifecycle_status", "active").in("target_node_id", chunk).order("target_node_id").order("source_node_id").order("id"), "Navigation prerequisite lookup"),
    fetchNavigationRowsByChunks(nodeIds, (chunk) => client.from("user_knowledge_states").select("node_id,status").eq("user_id", user.id).in("node_id", chunk).order("node_id"), "Navigation Knowledge state lookup"),
    fetchNavigationRowsByChunks(nodeIds, (chunk) => client.from("micro_learning_paths").select("id,knowledge_id,required").is("course_id", null).eq("scope", "global").eq("status", "published").eq("mode", "learn").in("knowledge_id", chunk).order("knowledge_id").order("id"), "Global Micro navigation lookup"),
    fetchNavigationRowsByChunks(assignmentIds, (chunk) => client.from("performance_results").select("id,assignment_id,outcome,evaluated_at,version").eq("user_id", user.id).eq("course_id", courseId).in("assignment_id", chunk).order("evaluated_at", { ascending: false }).order("version", { ascending: false }).order("id", { ascending: false }), "Navigation PerformanceResult lookup")
  ]);
  const revisionIds = nodes.map((row) => text(row, "current_revision_id"));
  const revisions = await fetchNavigationRowsByChunks(revisionIds, (chunk) => client.from("knowledge_node_revisions").select("id,title").in("id", chunk).order("id"), "Navigation Knowledge title lookup");
  const titleByRevision = new Map(revisions.map((row) => [text(row, "id"), text(row, "title")]));
  const lessonOrder = new Map(lessons.map((row) => [text(row, "id"), Number(row.display_order)]));
  const primaryCoverage = new Map<string, Row>();
  [...coverages].sort((left, right) => (lessonOrder.get(text(left, "lesson_id")) ?? 0) - (lessonOrder.get(text(right, "lesson_id")) ?? 0) || Number(left.display_order) - Number(right.display_order)).forEach((row) => { if (!primaryCoverage.has(text(row, "node_id"))) primaryCoverage.set(text(row, "node_id"), row); });

  const courseMicroNodeIds = new Set(courseMicro.map((row) => text(row, "knowledge_id")));
  const preferredMicroRows:Array<Row&{navigation_order:number}> = [...courseMicro.map((row):Row&{navigation_order:number}=>({...row,navigation_order:0})), ...globalMicro.filter((row) => courseNodeIds.has(text(row, "knowledge_id")) && !courseMicroNodeIds.has(text(row, "knowledge_id"))).map((row):Row&{navigation_order:number}=>({...row,navigation_order:1}))];
  const microPaths = preferredMicroRows.map((row): NavigationAsset => ({ id: text(row, "id"), nodeId: text(row, "knowledge_id"), order:row.navigation_order, required: Boolean(row.required) }));
  const completedMicroRows = await fetchNavigationRowsByChunks(microPaths.map((path) => path.id), (chunk) => client.from("user_micro_path_progress").select("path_id,status").eq("user_id", user.id).eq("status", "completed").in("path_id", chunk).order("path_id"), "Navigation Micro progress lookup");
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
    targetNodeIds:targets.map((row)=>text(row,"knowledge_id")),
    nodes: nodes.map((row) => { const coverage = primaryCoverage.get(text(row, "id"))!; return { id: text(row, "id"), title: titleByRevision.get(text(row, "current_revision_id")) ?? text(row, "id"), lessonOrder: lessonOrder.get(text(coverage, "lesson_id")) ?? 0, coverageOrder: Number(coverage.display_order) }; }),
    prerequisiteEdges: edges.map((row) => ({ source: text(row, "source_node_id"), target: text(row, "target_node_id") })),
    knowledgeStatuses: Object.fromEntries(states.map((row) => [text(row, "node_id"), text(row, "status") as NavigationKnowledgeStatus])),
    microPaths,
    completedMicroPathIds: completedMicroRows.map((row) => text(row, "path_id")),
    assignments,
    assignmentOutcomes: outcomes,
    materials: (()=>{const order=new Map(materialsRows.map((row)=>[text(row,"id"),Number(row.display_order)]));return materialCoverageRows.map((row) => ({ id: text(row, "material_id"), nodeId: text(row, "node_id"),order:order.get(text(row,"material_id"))??0 }));})()
  };
  const plan = computeNavigationPlan(input);
  const canonicalInput = {
    ...input,
    targetNodeIds:[...input.targetNodeIds].sort(),
    nodes: [...input.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    prerequisiteEdges: [...input.prerequisiteEdges].sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)),
    knowledgeStatuses: Object.fromEntries(Object.entries(input.knowledgeStatuses).sort(([left], [right]) => left.localeCompare(right))),
    microPaths: [...input.microPaths].sort((left, right) => `${left.nodeId}:${left.id}`.localeCompare(`${right.nodeId}:${right.id}`)),
    completedMicroPathIds: [...input.completedMicroPathIds].sort(),
    assignments: [...input.assignments].sort((left, right) => `${left.nodeId}:${left.id}`.localeCompare(`${right.nodeId}:${right.id}`)),
    assignmentOutcomes: Object.fromEntries(Object.entries(input.assignmentOutcomes).sort(([left], [right]) => left.localeCompare(right))),
    materials: [...input.materials].sort((left, right) => `${left.nodeId}:${left.id}`.localeCompare(`${right.nodeId}:${right.id}`))
  };
  const inputHash = createHash("sha256").update(JSON.stringify(canonicalInput)).digest("hex");
  const server = createServerSupabase();
  const write = await server.from("navigation_decisions").upsert({ user_id: user.id, course_id: courseId, policy_version: plan.policyVersion, input_hash: inputHash, path: plan.path, next_action: plan.nextAction, reason_code: plan.nextAction.reasonCode }, { onConflict: "user_id,course_id,policy_version,input_hash", ignoreDuplicates: true });
  dataOrThrow(write.data, write.error, "NavigationDecision write");
  const decisionResult = await server.from("navigation_decisions").select("id,decided_at").eq("user_id", user.id).eq("course_id", courseId).eq("policy_version", plan.policyVersion).eq("input_hash", inputHash).single();
  const decision = dataOrThrow(decisionResult.data as Row | null, decisionResult.error, "NavigationDecision readback");
  json(response, 200, { decisionId: text(decision, "id"), decidedAt: text(decision, "decided_at"), ...plan });
});
