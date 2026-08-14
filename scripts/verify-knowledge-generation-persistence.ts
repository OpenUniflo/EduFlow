import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabaseUrl } from "./local-supabase";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const url = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const server = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const courseId = `phase4-2-persistence-${suffix}`;
const materialId = `material-${suffix}`;
const nodeIds = [`uk-${suffix}-a`, `uk-${suffix}-b`];
let userId = "";

async function insertRun() {
  const result = await server.from("knowledge_generation_runs").insert({
    course_id: courseId, material_id: materialId, owner_user_id: userId, status: "running", provider: "fake", model: "fake-model",
    prompt_version: "phase4.2-v1", schema_versions: ["knowledge-candidates-v1", "knowledge-relations-v1", "generated-curriculum-v1"]
  }).select("id").single();
  if (result.error || !result.data) throw new Error(`run insert failed: ${result.error?.message}`);
  return String(result.data.id);
}

function payload(runId: string) {
  const provenance = [{ sourceType: "material", sourceId: materialId, courseId, materialId, generationRunId: runId, sourceLocations: [{ rawBlockId: "#/texts/1", ordinal: 1, sectionPath: ["Chapter"] }] }];
  return {
    nodes: nodeIds.map((id, index) => ({ id, revisionId: `${id}-r1`, title: `Knowledge ${index}`, description: `Description ${index}`, type: "conceptual", masteryCriteria: [`Explain ${index}`], provenance, metadata: { aliases: [] } })),
    relations: [{ id: `ke-${suffix}`, source: nodeIds[0], target: nodeIds[1], relation: "prerequisite", strength: "hard", reason: "A before B", provenance }],
    chapters: [{ id: `chapter-${suffix}`, title: "Generated", description: "Generated chapter", outcome: "Complete", order: 0, color: "#6f85ff" }],
    lessons: [{ id: `lesson-${suffix}`, chapterId: `chapter-${suffix}`, title: "Generated lesson", order: 0 }],
    coverages: nodeIds.map((nodeId, order) => ({ id: `coverage-${suffix}-${order}`, lessonId: `lesson-${suffix}`, nodeId, role: "introduce", order })),
    duplicateCount: 0,
    executions: [{ stage: "extraction", provider: "fake", model: "fake-model", promptVersion: "phase4.2-v1", schemaVersion: "knowledge-candidates-v1", requestId: "fake", generatedAt: new Date().toISOString() }]
  };
}

try {
  const auth = await server.auth.admin.createUser({ email: `phase4-2-${suffix}@eduflow.local`, password: randomUUID(), email_confirm: true });
  if (auth.error || !auth.data.user) throw new Error(`auth setup failed: ${auth.error?.message}`);
  userId = auth.data.user.id;
  const setup = [
    await server.from("courses").insert({ id: courseId, title: "Phase 4.2", description: "Persistence verification", revision: "draft", generation_status: "parsed" }),
    await server.from("course_curricula").insert({ course_id: courseId, id: `curriculum-${suffix}`, generation_mode: "follow-source" }),
    await server.from("curriculum_chapters").insert({ course_id: courseId, id: `placeholder-chapter-${suffix}`, title: "Upload", description: "Upload", display_order: 0, color: "#000000", outcome: "Parsed" }),
    await server.from("curriculum_lessons").insert({ course_id: courseId, id: `placeholder-lesson-${suffix}`, chapter_id: `placeholder-chapter-${suffix}`, title: "Upload", display_order: 0 }),
    await server.from("materials").insert({ course_id: courseId, id: materialId, lesson_id: `placeholder-lesson-${suffix}`, display_order: 0, title: "Source", material_type: "docx", uploaded_by: userId })
  ];
  setup.forEach((result) => { if (result.error) throw new Error(`setup failed: ${result.error.message}`); });

  const firstRun = await insertRun();
  const first = await server.rpc("persist_knowledge_generation", { target_run_id: firstRun, payload: payload(firstRun) });
  if (first.error) throw new Error(`first persistence failed: ${first.error.message}`);
  const firstCounts = await Promise.all([
    server.from("knowledge_nodes").select("id", { count: "exact", head: true }).in("id", nodeIds),
    server.from("knowledge_edges").select("id", { count: "exact", head: true }).eq("id", `ke-${suffix}`),
    server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId),
    server.from("knowledge_generation_runs").select("status").eq("id", firstRun).single()
  ]);
  assert(firstCounts[0].count === 2 && firstCounts[1].count === 1 && firstCounts[2].count === 2, "first persistence did not atomically create graph/curriculum rows");
  assert(firstCounts[3].data?.status === "completed", "first run was not completed");

  const secondRun = await insertRun();
  const second = await server.rpc("persist_knowledge_generation", { target_run_id: secondRun, payload: payload(secondRun) });
  if (second.error) throw new Error(`idempotent rerun failed: ${second.error.message}`);
  const rerunCounts = await Promise.all([
    server.from("knowledge_nodes").select("id", { count: "exact", head: true }).in("id", nodeIds),
    server.from("knowledge_edges").select("id", { count: "exact", head: true }).eq("id", `ke-${suffix}`),
    server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId)
  ]);
  assert(rerunCounts.every((result, index) => result.count === [2, 1, 2][index]), "rerun created uncontrolled duplicates");

  const replacementRun = await insertRun();
  const replacementPayload = payload(replacementRun);
  replacementPayload.relations = [];
  const replacement = await server.rpc("persist_knowledge_generation", { target_run_id: replacementRun, payload: replacementPayload });
  if (replacement.error) throw new Error(`relation replacement rerun failed: ${replacement.error.message}`);
  const relationLifecycle = await server.from("knowledge_edges").select("lifecycle_status").eq("id", `ke-${suffix}`).single();
  assert(relationLifecycle.data?.lifecycle_status === "deprecated", "rerun did not preserve the stale edge as deprecated history");

  const failingRun = await insertRun();
  const before = await server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const invalid = payload(failingRun);
  invalid.coverages[0].nodeId = "missing-node";
  const failed = await server.rpc("persist_knowledge_generation", { target_run_id: failingRun, payload: invalid });
  assert(Boolean(failed.error), "invalid persistence unexpectedly succeeded");
  const after = await server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  assert(before.count === after.count, "failed transaction left partial curriculum changes");
  await server.from("knowledge_generation_runs").update({ status: "failed", error_code: "expected_test_failure", error_message: "expected", completed_at: new Date().toISOString() }).eq("id", failingRun);

  console.log("Phase 4.2 persistence: passed (atomic write, reload, idempotent rerun, rollback)");
} finally {
  await server.from("knowledge_generation_runs").delete().eq("course_id", courseId);
  await server.from("courses").delete().eq("id", courseId);
  await server.from("knowledge_edges").delete().eq("id", `ke-${suffix}`);
  await server.from("knowledge_nodes").delete().in("id", nodeIds);
  if (userId) await server.auth.admin.deleteUser(userId);
}
