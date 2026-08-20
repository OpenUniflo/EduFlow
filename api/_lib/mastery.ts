import type { createUserSupabase } from "./supabase.js";
import { dataOrThrow } from "./query.js";

type Row = Record<string, unknown>;
type SupabaseClient = Awaited<ReturnType<typeof createUserSupabase>>["client"];
const text = (row: Row, key: string) => String(row[key]);
const weakKnowledgeStatus = (status: string) => ["explore", "learning", "learned", "practicing"].includes(status);

export async function updateKnowledgeAtLeast(client: SupabaseClient, userId: string, nodeId: string, status: "learning" | "practicing" | "mastered") {
  const existingResult = await client.from("user_knowledge_states").select("status").eq("user_id", userId).eq("node_id", nodeId).maybeSingle();
  const existing = dataOrThrow(existingResult.data as Row | null, existingResult.error, "Knowledge state lookup");
  if (existing && !weakKnowledgeStatus(text(existing, "status"))) return;
  const rank = { explore: 0, learning: 1, learned: 2, practicing: 3, mastered: 4 } as const;
  if (existing && rank[text(existing, "status") as keyof typeof rank] >= rank[status]) return;
  const write = await client.from("user_knowledge_states").upsert({ user_id: userId, node_id: nodeId, status, updated_at: new Date().toISOString() });
  dataOrThrow(write.data, write.error, "Knowledge state update");
}

export async function recomputeMastery(client: SupabaseClient, userId: string, nodeId: string, courseId: string) {
  const [pathsResult, pathProgressResult, coveragesResult] = await Promise.all([
    client.from("micro_learning_paths").select("id").eq("knowledge_id", nodeId).eq("course_id", courseId).eq("mode", "learn").eq("required", true).eq("status", "published"),
    client.from("user_micro_path_progress").select("path_id,status").eq("user_id", userId),
    client.from("assignment_coverages").select("course_id,assignment_id").eq("node_id", nodeId).eq("course_id", courseId).eq("required", true)
  ]);
  const paths = dataOrThrow(pathsResult.data as Row[] | null, pathsResult.error, "Required Micro paths lookup");
  const pathProgress = dataOrThrow(pathProgressResult.data as Row[] | null, pathProgressResult.error, "Micro progress lookup");
  const requiredAssignments = dataOrThrow(coveragesResult.data as Row[] | null, coveragesResult.error, "Required assignment lookup");
  const completedPaths = new Set(pathProgress.filter((row) => text(row, "status") === "completed").map((row) => text(row, "path_id")));
  if (!paths.length || !paths.every((path) => completedPaths.has(text(path, "id"))) || !requiredAssignments.length) return false;
  const acceptedResult = await client.from("user_assignment_states").select("course_id,assignment_id,status").eq("user_id", userId).eq("status", "accepted");
  const accepted = dataOrThrow(acceptedResult.data as Row[] | null, acceptedResult.error, "Accepted assignments lookup");
  const acceptedKeys = new Set(accepted.map((row) => `${text(row, "course_id")}:${text(row, "assignment_id")}`));
  if (!requiredAssignments.every((row) => acceptedKeys.has(`${text(row, "course_id")}:${text(row, "assignment_id")}`))) return false;
  await updateKnowledgeAtLeast(client, userId, nodeId, "mastered");
  return true;
}
