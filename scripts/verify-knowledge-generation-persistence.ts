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

type RelationInput =
  | { type: "prerequisite"; strength: "hard" | "soft"; reason: string }
  | { type: "enables"; strength: number; reason: string };

async function insertRun() {
  const result = await server.from("knowledge_generation_runs").insert({
    course_id: courseId, material_id: materialId, owner_user_id: userId, status: "running", provider: "fake", model: "fake-model",
    prompt_version: "phase4.2-v1", schema_versions: ["knowledge-candidates-v1", "knowledge-relations-v1", "generated-curriculum-v1"]
  }).select("id").single();
  if (result.error || !result.data) throw new Error(`run insert failed: ${result.error?.message}`);
  return String(result.data.id);
}

function payload(runId: string, relation: RelationInput | null) {
  const provenance = [{ sourceType: "material", sourceId: materialId, courseId, materialId, generationRunId: runId, sourceLocations: [{ rawBlockId: "#/texts/1", ordinal: 1, sectionPath: ["Chapter"] }] }];
  return {
    nodes: nodeIds.map((id, index) => ({ id, revisionId: `${id}-r1`, title: `Knowledge ${index}`, description: `Description ${index}`, type: "conceptual", masteryCriteria: [`Explain ${index}`], provenance, metadata: { aliases: [] } })),
    relations: relation ? [{ id: `ke-${suffix}-${relation.type}`, source: nodeIds[0], target: nodeIds[1], relation: relation.type, strength: relation.strength, reason: relation.reason, provenance }] : [],
    chapters: [{ id: `chapter-${suffix}`, title: "Generated", description: "Generated chapter", outcome: "Complete", order: 0, color: "#6f85ff" }],
    lessons: [{ id: `lesson-${suffix}`, chapterId: `chapter-${suffix}`, title: "Generated lesson", order: 0 }],
    coverages: nodeIds.map((nodeId, order) => ({ id: `coverage-${suffix}-${order}`, lessonId: `lesson-${suffix}`, nodeId, role: "introduce", order })),
    duplicateCount: 0,
    executions: [{ stage: "extraction", provider: "fake", model: "fake-model", promptVersion: "phase4.2-v1", schemaVersion: "knowledge-candidates-v1", requestId: "fake", generatedAt: new Date().toISOString() }]
  };
}

async function relationState(type: RelationInput["type"]) {
  const result = await server.from("knowledge_edges")
    .select("relation, prerequisite_strength, associative_strength, lifecycle_status, reason")
    .eq("source_node_id", nodeIds[0]).eq("target_node_id", nodeIds[1]).eq("relation", type).single();
  if (result.error || !result.data) throw new Error(`relation state read failed: ${result.error?.message}`);
  return result.data;
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
    await server.from("materials").insert({ course_id: courseId, id: materialId, display_order: 0, title: "Source", material_type: "docx", uploaded_by: userId })
  ];
  setup.forEach((result) => { if (result.error) throw new Error(`setup failed: ${result.error.message}`); });

  const firstRun = await insertRun();
  const first = await server.rpc("persist_knowledge_generation", { target_run_id: firstRun, payload: payload(firstRun, { type: "prerequisite", strength: "hard", reason: "A is required before B" }) });
  if (first.error) throw new Error(`first persistence failed: ${first.error.message}`);
  const firstCounts = await Promise.all([
    server.from("knowledge_nodes").select("id", { count: "exact", head: true }).in("id", nodeIds),
    server.from("knowledge_edges").select("id", { count: "exact", head: true }).eq("source_node_id", nodeIds[0]).eq("target_node_id", nodeIds[1]),
    server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId),
    server.from("knowledge_generation_runs").select("status").eq("id", firstRun).single()
  ]);
  assert(firstCounts[0].count === 2 && firstCounts[1].count === 1 && firstCounts[2].count === 2, "first persistence did not atomically create graph/curriculum rows");
  assert(firstCounts[3].data?.status === "completed", "first run was not completed");

  const secondRun = await insertRun();
  const second = await server.rpc("persist_knowledge_generation", { target_run_id: secondRun, payload: payload(secondRun, { type: "prerequisite", strength: "soft", reason: "A materially prepares B" }) });
  if (second.error) throw new Error(`hard-to-soft rerun failed: ${second.error.message}`);
  const softPrerequisite = await relationState("prerequisite");
  assert(softPrerequisite.prerequisite_strength === "soft" && softPrerequisite.associative_strength === null && softPrerequisite.lifecycle_status === "active", "hard-to-soft rerun did not update the active prerequisite strength");

  const thirdRun = await insertRun();
  const third = await server.rpc("persist_knowledge_generation", { target_run_id: thirdRun, payload: payload(thirdRun, { type: "prerequisite", strength: "hard", reason: "A is now required before B" }) });
  if (third.error) throw new Error(`soft-to-hard rerun failed: ${third.error.message}`);
  const hardPrerequisite = await relationState("prerequisite");
  assert(hardPrerequisite.prerequisite_strength === "hard" && hardPrerequisite.lifecycle_status === "active", "soft-to-hard rerun did not update the active prerequisite strength");

  const firstEnablesRun = await insertRun();
  const firstEnables = await server.rpc("persist_knowledge_generation", { target_run_id: firstEnablesRun, payload: payload(firstEnablesRun, { type: "enables", strength: 0.5, reason: "A partially enables B" }) });
  if (firstEnables.error) throw new Error(`first enables persistence failed: ${firstEnables.error.message}`);
  const initialEnables = await relationState("enables");
  assert(Number(initialEnables.associative_strength) === 0.5 && initialEnables.prerequisite_strength === null && initialEnables.lifecycle_status === "active", "initial enables strength was not persisted");

  const secondEnablesRun = await insertRun();
  const secondEnables = await server.rpc("persist_knowledge_generation", { target_run_id: secondEnablesRun, payload: payload(secondEnablesRun, { type: "enables", strength: 0.8, reason: "A strongly enables B" }) });
  if (secondEnables.error) throw new Error(`enables strength rerun failed: ${secondEnables.error.message}`);
  const updatedEnables = await relationState("enables");
  assert(Number(updatedEnables.associative_strength) === 0.8 && updatedEnables.lifecycle_status === "active", "enables rerun did not update associative strength");

  const rerunCounts = await Promise.all([
    server.from("knowledge_nodes").select("id", { count: "exact", head: true }).in("id", nodeIds),
    server.from("knowledge_edges").select("id", { count: "exact", head: true }).eq("source_node_id", nodeIds[0]).eq("target_node_id", nodeIds[1]),
    server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId)
  ]);
  assert(rerunCounts.every((result, index) => result.count === [2, 2, 2][index]), "rerun created uncontrolled duplicates");

  const replacementRun = await insertRun();
  const replacementPayload = payload(replacementRun, null);
  const replacement = await server.rpc("persist_knowledge_generation", { target_run_id: replacementRun, payload: replacementPayload });
  if (replacement.error) throw new Error(`relation replacement rerun failed: ${replacement.error.message}`);
  const staleEnables = await relationState("enables");
  assert(staleEnables.lifecycle_status === "deprecated", "rerun did not preserve the stale edge as deprecated history");

  const rollbackBaselineRun = await insertRun();
  const rollbackBaseline = await server.rpc("persist_knowledge_generation", { target_run_id: rollbackBaselineRun, payload: payload(rollbackBaselineRun, { type: "enables", strength: 0.8, reason: "A strongly enables B" }) });
  if (rollbackBaseline.error) throw new Error(`rollback baseline persistence failed: ${rollbackBaseline.error.message}`);

  const failingRun = await insertRun();
  const before = await server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const invalid = payload(failingRun, { type: "prerequisite", strength: "soft", reason: "This update must roll back" });
  invalid.coverages[0].nodeId = "missing-node";
  const failed = await server.rpc("persist_knowledge_generation", { target_run_id: failingRun, payload: invalid });
  assert(Boolean(failed.error), "invalid persistence unexpectedly succeeded");
  const after = await server.from("curriculum_coverages").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  assert(before.count === after.count, "failed transaction left partial curriculum changes");
  const enablesAfterRollback = await relationState("enables");
  const prerequisiteAfterRollback = await relationState("prerequisite");
  assert(enablesAfterRollback.lifecycle_status === "active" && Number(enablesAfterRollback.associative_strength) === 0.8, "failed transaction partially deprecated or changed the previous active edge");
  assert(prerequisiteAfterRollback.lifecycle_status === "deprecated" && prerequisiteAfterRollback.prerequisite_strength === "hard", "failed transaction partially activated or changed a stale prerequisite edge");
  await server.from("knowledge_generation_runs").update({ status: "failed", error_code: "expected_test_failure", error_message: "expected", completed_at: new Date().toISOString() }).eq("id", failingRun);

  console.log("Phase 4.2 persistence: passed (atomic write, strength reruns, stale lifecycle, rollback)");
} finally {
  await server.from("knowledge_generation_runs").delete().eq("course_id", courseId);
  await server.from("courses").delete().eq("id", courseId);
  await server.from("knowledge_edges").delete().eq("source_node_id", nodeIds[0]).eq("target_node_id", nodeIds[1]);
  await server.from("knowledge_nodes").delete().in("id", nodeIds);
  if (userId) await server.auth.admin.deleteUser(userId);
}
