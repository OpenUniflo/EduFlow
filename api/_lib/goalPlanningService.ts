import type { SupabaseClient, User } from "@supabase/supabase-js";
import { computePrerequisiteClosure, matchCoursesToGoal, resolveGoalToKnowledge, type GoalPlan } from "../../src/features/course/goal/goalPlanning.js";
import type { KnowledgeEdge } from "../../src/features/knowledge/types.js";
import { ApiError } from "./http.js";
import { dataOrThrow } from "./query.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);

export async function planLearningGoal(client: SupabaseClient, goalText: string, suggestedKnowledgeIds?: string[]): Promise<GoalPlan> {
  const [nodeResult, edgeResult, courseResult, coverageResult] = await Promise.all([
    client.from("knowledge_nodes").select("id,title,description,status,tags").eq("status", "active").limit(1000),
    client.from("knowledge_edges").select("id,source_node_id,target_node_id,relation,reason,prerequisite_strength,associative_strength").eq("lifecycle_status", "active").limit(5000),
    client.from("courses").select("id,title,lifecycle,course_type").eq("lifecycle", "published").limit(500),
    client.from("curriculum_coverages").select("course_id,node_id").limit(10000)
  ]);
  const nodeRows = dataOrThrow(nodeResult.data as Row[] | null, nodeResult.error, "Goal visible Knowledge lookup");
  const edgeRows = dataOrThrow(edgeResult.data as Row[] | null, edgeResult.error, "Goal prerequisite lookup");
  const courseRows = dataOrThrow(courseResult.data as Row[] | null, courseResult.error, "Goal accessible Course lookup");
  const coverageRows = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Goal Course coverage lookup");
  const visibleNodes = nodeRows.map((row) => ({ id: text(row, "id"), title: text(row, "title"), description: text(row, "description"), status: text(row, "status") as "active", tags: Array.isArray(row.tags) ? row.tags.map(String) : undefined }));
  const resolution = resolveGoalToKnowledge({ goalText, visibleNodes, suggestedKnowledgeIds });
  if (resolution.status !== "ready") return { resolution, prerequisiteKnowledge: [], prerequisiteCycleDetected: false, matches: [] };

  const edges = edgeRows.map((row): KnowledgeEdge => text(row, "relation") === "prerequisite"
    ? { id: text(row, "id"), source: text(row, "source_node_id"), target: text(row, "target_node_id"), relation: "prerequisite", strength: text(row, "prerequisite_strength") as "hard" | "soft", reason: text(row, "reason") }
    : { id: text(row, "id"), source: text(row, "source_node_id"), target: text(row, "target_node_id"), relation: text(row, "relation") as "enables" | "related", strength: Number(row.associative_strength), reason: text(row, "reason") });
  const closure = computePrerequisiteClosure(resolution.targetKnowledge.map((item) => item.id), edges);
  const nodeById = new Map(visibleNodes.map((node) => [node.id, node]));
  const prerequisiteKnowledge = closure.prerequisiteKnowledgeIds.flatMap((id) => {
    const node = nodeById.get(id);
    return node ? [{ id: node.id, title: node.title, description: node.description }] : [];
  });
  const coverageByCourse = new Map<string, string[]>();
  coverageRows.forEach((row) => coverageByCourse.set(text(row, "course_id"), [...(coverageByCourse.get(text(row, "course_id")) ?? []), text(row, "node_id")]));
  const matches = matchCoursesToGoal({
    targetKnowledgeIds: resolution.targetKnowledge.map((item) => item.id),
    prerequisiteKnowledgeIds: closure.prerequisiteKnowledgeIds,
    courses: courseRows.map((row) => ({ id: text(row, "id"), title: text(row, "title"), lifecycle: text(row, "lifecycle") as "published", courseType: (row.course_type == null ? "standard" : text(row, "course_type")) as "standard" | "personal", coveredKnowledgeIds: coverageByCourse.get(text(row, "id")) ?? [] }))
  });
  return { resolution, prerequisiteKnowledge, prerequisiteCycleDetected: closure.cycleDetected, matches };
}

export async function useExistingCourse(client: SupabaseClient, user: User, input: { goalText: string; courseId: string }) {
  const plan = await planLearningGoal(client, input.goalText);
  if (plan.resolution.status !== "ready" || plan.prerequisiteCycleDetected) throw new ApiError(409, "goal_not_ready", "The learning goal is not ready for Course selection");
  const match = plan.matches.find((candidate) => candidate.courseId === input.courseId);
  if (!match || match.level === "low") throw new ApiError(409, "course_match_not_suitable", "The selected Course is not a suitable existing Course match");
  const write = await client.from("user_course_states").upsert({ user_id: user.id, course_id: input.courseId, is_active: true, updated_at: new Date().toISOString() });
  dataOrThrow(write.data, write.error, "Goal existing Course membership activation");
  return { courseId: input.courseId, match };
}

export async function createPersonalCourse(server: SupabaseClient, client: SupabaseClient, user: User, input: { goalText: string; sourceCourseId?: string }) {
  const plan = await planLearningGoal(client, input.goalText);
  if (plan.resolution.status !== "ready") throw new ApiError(409, "goal_not_ready", "The learning goal must resolve to existing Knowledge before creating a Personal Course");
  if (plan.prerequisiteCycleDetected) throw new ApiError(409, "goal_prerequisite_cycle", "The factual prerequisite graph contains a cycle for this goal");
  if (input.sourceCourseId) {
    const source = plan.matches.find((candidate) => candidate.courseId === input.sourceCourseId);
    if (!source || source.level === "low") throw new ApiError(409, "personal_course_source_unsuitable", "The selected source Course is unavailable or does not cover enough of the goal");
  }
  const targetIds = plan.resolution.targetKnowledge.map((item) => item.id);
  const orderedIds = [...plan.prerequisiteKnowledge.map((item) => item.id), ...targetIds.filter((id) => !plan.prerequisiteKnowledge.some((item) => item.id === id))];
  const result = await server.rpc("create_personal_course", {
    p_owner_user_id: user.id,
    p_goal_text: plan.resolution.goalText,
    p_source_course_id: input.sourceCourseId ?? null,
    p_target_knowledge_ids: targetIds,
    p_ordered_knowledge_ids: orderedIds
  });
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Personal Course creation");
  const row = rows[0];
  if (!row) throw new ApiError(500, "personal_course_creation_failed", "Personal Course creation returned no identity");
  return { courseId: text(row, "course_id"), plan };
}

export function goalPlanSummary(plan: GoalPlan) {
  if (plan.resolution.status === "unsupported") return `未找到可可靠映射的 Knowledge：${plan.resolution.reason ?? "目标暂不支持"}`;
  if (plan.resolution.status === "ambiguous") return `目标存在歧义：${plan.resolution.candidates.map((item) => item.title).join("、")}`;
  const best = plan.matches[0];
  return `已解析目标 Knowledge：${plan.resolution.targetKnowledge.map((item) => item.title).join("、")}。${best ? `最佳现有课程为「${best.courseTitle}」，目标覆盖 ${Math.round(best.targetCoverage * 100)}%，所需范围覆盖 ${Math.round(best.requiredCoverage * 100)}%。` : "当前没有可访问的现有课程。"}`;
}
