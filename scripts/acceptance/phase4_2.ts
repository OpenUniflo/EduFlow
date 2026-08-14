import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertLocalSupabaseUrl } from "../local-supabase";
import { SupabaseKnowledgeGenerationRepository } from "../../api/_lib/knowledgeGenerationRepository";
import { createJsonGenerationClient } from "../../api/_lib/llm";
import { readEmbeddingEnvironment, readLlmEnvironment } from "../../api/_lib/env";
import { createEmbeddingService } from "../../api/_lib/embedding";
import { runKnowledgeGenerationPipeline } from "../../src/features/knowledge/generation/pipeline";
import { selectCourseMaterialScope } from "../../src/features/knowledge/generation/materialScope";
import { KNOWLEDGE_GENERATION_PROMPT_VERSION } from "../../src/features/knowledge/generation/prompts";
import { evaluateKnowledgeGeneration, type KnowledgeGold } from "../../src/features/knowledge/generation/evaluation";
import nodesJson from "../../fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/knowledge-nodes.json";
import relationsJson from "../../fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/knowledge-relations.json";
import negativeJson from "../../fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/negative-cases.json";
import knowledgeHandler from "../../api/knowledge";
import coursesHandler from "../../api/courses";
import { InMemoryKnowledgeRepository } from "../../src/features/knowledge/repository/InMemoryKnowledgeRepository";
import { buildCourseGraphData, validateCourseRuntime, type CourseRuntimeData } from "../../src/features/course/runtime/courseRuntime";
import { userKnowledgeAccess } from "../../src/features/knowledge/repository/KnowledgeRepository";
import type { KnowledgeGraph } from "../../src/features/knowledge/types";

const REPO = join(import.meta.dirname, "../..");
const OUTPUT = join(REPO, "phase4.2-acceptance");
const CORPUS = join(REPO, "fixtures/phase4-agentic-ai/corpus/AI-Agents-in-Depth-zh-CN-v1.4.pdf");
const SCHEMA_VERSIONS = ["knowledge-candidates-v1", "knowledge-candidates-consolidated-v1", "knowledge-candidates-atomicity-audit-v1", "knowledge-candidate-admission-v1", "knowledge-relations-v1", "generated-curriculum-v1"];

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function runParserWorker(jobId: string) {
  console.log(`Phase 4.1 worker: parsing canonical PDF for job ${jobId}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("uv", ["run", "eduflow-parser-job", jobId], { cwd: join(REPO, "services/parser"), env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Parser worker exited with ${code}`)));
  });
}
async function callHandler(handler: (request: VercelRequest, response: VercelResponse) => Promise<void> | void, token: string, query: Record<string, string>) {
  let body: unknown;
  let status = 0;
  const response = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { body = value; return this; },
    setHeader() { return this; }
  } as unknown as VercelResponse;
  await handler({ method: "GET", headers: { authorization: `Bearer ${token}` }, query } as unknown as VercelRequest, response);
  if (status >= 400) throw new Error(`API handoff failed with HTTP ${status}`);
  return body;
}

const supabaseUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const server = createClient(supabaseUrl, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
const env = readLlmEnvironment();
const existingJobId = argument("--job-id");
const existingOwnerId = argument("--owner-id");
const keep = process.argv.includes("--keep");
const created = { userId: "", courseId: "", materialId: "", jobId: "", storagePath: "", password: "", email: "" };

try {
  if (existingJobId || existingOwnerId) {
    if (!existingJobId || !existingOwnerId) throw new Error("--job-id and --owner-id must be provided together");
    created.jobId = existingJobId;
    created.userId = existingOwnerId;
    const existingUser = await server.auth.admin.getUserById(created.userId);
    if (existingUser.error || !existingUser.data.user.email) throw new Error(`Existing acceptance user lookup failed: ${existingUser.error?.message}`);
    created.email = existingUser.data.user.email;
    created.password = `Phase4-${randomUUID()}`;
    const passwordUpdate = await server.auth.admin.updateUserById(created.userId, { password: created.password });
    if (passwordUpdate.error) throw new Error(`Existing acceptance user password reset failed: ${passwordUpdate.error.message}`);
  } else {
    const suffix = randomUUID().slice(0, 8);
    created.courseId = `phase4-2-live-${suffix}`;
    created.materialId = `agentic-ai-book-${suffix}`;
    created.storagePath = `${created.userId || "acceptance"}/${created.courseId}/AI-Agents-in-Depth-zh-CN-v1.4.pdf`;
    created.email = `phase4-2-live-${suffix}@eduflow.local`;
    created.password = `Phase4-${randomUUID()}`;
    const auth = await server.auth.admin.createUser({ email: created.email, password: created.password, email_confirm: true });
    if (auth.error || !auth.data.user) throw new Error(`Acceptance user creation failed: ${auth.error?.message}`);
    created.userId = auth.data.user.id;
    created.storagePath = `${created.userId}/${created.courseId}/AI-Agents-in-Depth-zh-CN-v1.4.pdf`;
    const rows = [
      await server.from("profiles").upsert({ id: created.userId, display_name: "Phase 4.2 Acceptance", capabilities: ["global-domain-admin"] }),
      await server.from("courses").insert({ id: created.courseId, title: "Agentic AI — Phase 4.2", description: "Canonical Chapter 1 live generation", revision: "draft", generation_status: "draft" }),
      await server.from("course_curricula").insert({ course_id: created.courseId, id: `curriculum-${suffix}`, generation_mode: "follow-source" }),
      await server.from("curriculum_chapters").insert({ course_id: created.courseId, id: `upload-chapter-${suffix}`, title: "Source Upload", description: "Parser handoff", display_order: 0, color: "#6f85ff", outcome: "Parsed material" }),
      await server.from("curriculum_lessons").insert({ course_id: created.courseId, id: `upload-lesson-${suffix}`, chapter_id: `upload-chapter-${suffix}`, title: "Source Upload", display_order: 0 })
    ];
    rows.forEach((row) => { if (row.error) throw new Error(`Acceptance setup failed: ${row.error.message}`); });
    const sourceBytes = await (await import("node:fs/promises")).readFile(CORPUS);
    const upload = await server.storage.from("course-materials").upload(created.storagePath, sourceBytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw new Error(`Canonical source upload failed: ${upload.error.message}`);
    const material = await server.from("materials").insert({ course_id: created.courseId, id: created.materialId, lesson_id: `upload-lesson-${suffix}`, display_order: 0, title: "深入理解 AI Agent", material_type: "pdf", storage_path: created.storagePath, page_count: 307, uploaded_by: created.userId });
    if (material.error) throw new Error(`Acceptance Material insert failed: ${material.error.message}`);
    const segments = Array.from({ length: 307 }, (_, index) => ({ course_id: created.courseId, material_id: created.materialId, id: `page-${index + 1}`, display_order: index, page: index + 1, title: `Page ${index + 1}` }));
    const segmentInsert = await server.from("material_segments").insert(segments);
    if (segmentInsert.error) throw new Error(`Acceptance MaterialSegment insert failed: ${segmentInsert.error.message}`);
    const job = await server.from("material_parsing_jobs").insert({ course_id: created.courseId, material_id: created.materialId, source_storage_path: created.storagePath, status: "pending", parser_version: "docling-2.119.0", adapter_version: "course-material-v1" }).select("id").single();
    if (job.error || !job.data) throw new Error(`Acceptance parsing job insert failed: ${job.error?.message}`);
    created.jobId = String(job.data.id);
    await runParserWorker(created.jobId);
  }

  const repository = new SupabaseKnowledgeGenerationRepository(server);
  const prepared = await repository.prepare({ parsingJobId: created.jobId, ownerId: created.userId, provider: env.llmProvider, model: env.llmModel, promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION, schemaVersions: SCHEMA_VERSIONS });
  created.courseId ||= prepared.courseId;
  created.materialId ||= prepared.material.sourceMaterialId;
  console.log(`DeepSeek: ${env.llmModel}; CourseMaterial chunks=${prepared.material.chunks.length}; Gold scope PDF 15-35`);
  const scoped = selectCourseMaterialScope(prepared.material, { pdfPages: { start: 15, end: 35 } });
  let result;
  try {
    result = await runKnowledgeGenerationPipeline({ courseId: prepared.courseId, ownerId: created.userId, material: scoped }, createJsonGenerationClient(env));
    await repository.persist(prepared.runId, result);
  } catch (error) {
    await repository.fail(prepared.runId, error);
    throw error;
  }
  const gold: KnowledgeGold = {
    nodes: nodesJson.nodes.map(({ id, canonicalTitle, aliases, description, masteryCriteria }) => ({ id, canonicalTitle, aliases, description, masteryCriteria })),
    relations: relationsJson.relations.map((relation) => ({ from: relation.from, to: relation.to, type: relation.type as "prerequisite" | "enables" | "related" })),
    negativeCases: negativeJson.negativeNodeCases.map(({ text }) => ({ text }))
  };
  const embeddingEnv = readEmbeddingEnvironment();
  const embedder = createEmbeddingService(embeddingEnv);
  const goldTexts = gold.nodes.map((node) => [node.canonicalTitle, ...node.aliases, node.description, ...(node.masteryCriteria ?? [])].filter(Boolean).join("。"));
  const predictedTexts = result.candidates.map((candidate) => [candidate.canonicalTitle, ...candidate.aliases, candidate.description, ...candidate.masteryCriteria].join("。"));
  const [goldEmbeddings, predictedEmbeddings] = await Promise.all([
    Promise.all(goldTexts.map((text) => embedder.embed(text))),
    Promise.all(predictedTexts.map((text) => embedder.embed(text)))
  ]);
  const cosine = (left: number[], right: number[]) => {
    let dot = 0; let leftNorm = 0; let rightNorm = 0;
    left.forEach((value, index) => { dot += value * right[index]; leftNorm += value * value; rightNorm += right[index] * right[index]; });
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  };
  const semanticScores = new Map(gold.nodes.flatMap((node, goldIndex) => result.candidates.map((candidate, candidateIndex) => [`${node.id}:${candidate.id}`, cosine(goldEmbeddings[goldIndex], predictedEmbeddings[candidateIndex])] as const)));
  const evaluation = evaluateKnowledgeGeneration(result, gold, { scores: semanticScores, provider: embeddingEnv.embeddingProvider, model: embeddingEnv.embeddingModel });

  let skillTree = { nodeCount: 0, edgeCount: 0, chapterCount: 0 };
  if (created.email && created.password) {
    const login = await server.auth.signInWithPassword({ email: created.email, password: created.password });
    if (login.error || !login.data.session) throw new Error(`Acceptance login failed: ${login.error?.message}`);
    const knowledgeResponse = await callHandler(knowledgeHandler, login.data.session.access_token, {} ) as { graph: KnowledgeGraph };
    const courseResponse = await callHandler(coursesHandler, login.data.session.access_token, { id: created.courseId }) as { course: CourseRuntimeData };
    const knowledgeRepository = new InMemoryKnowledgeRepository(knowledgeResponse.graph);
    validateCourseRuntime(courseResponse.course, knowledgeRepository, userKnowledgeAccess(created.userId));
    const projected = buildCourseGraphData(courseResponse.course, { userId: created.userId, courseId: created.courseId, assignmentStates: {}, materialStates: {}, updatedAt: new Date().toISOString() }, knowledgeResponse.graph);
    skillTree = { nodeCount: projected.knowledgeNodes.length, edgeCount: projected.knowledgeEdges.length, chapterCount: projected.chapters.length };
    assert(skillTree.nodeCount === result.candidates.length, "Formal Course Skill Tree lost generated Knowledge nodes");
  }
  mkdirSync(OUTPUT, { recursive: true });
  const report = { runId: prepared.runId, provider: env.llmProvider, model: env.llmModel, promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
    source: { parsingJobId: created.jobId, materialId: created.materialId, pdfPages: [15, 35], courseMaterialChunks: scoped.chunks.length },
    generated: { candidateCount: result.candidates.length, duplicateCount: result.duplicateCount, relationCount: result.relations.length, chapterCount: result.curriculum.chapters.length },
    skillTree, evaluation };
  writeFileSync(join(OUTPUT, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (keep) console.log(`Kept Local acceptance data: job=${created.jobId} owner=${created.userId}`);
} finally {
  if (!keep && !existingJobId && created.courseId) {
    const nodes = await server.from("knowledge_nodes").select("id").eq("scope", "user").eq("owner_id", created.userId);
    const nodeIds = (nodes.data ?? []).map((row) => row.id);
    await server.from("knowledge_generation_runs").delete().eq("course_id", created.courseId);
    await server.from("courses").delete().eq("id", created.courseId);
    if (nodeIds.length) {
      await server.from("knowledge_edges").delete().or(`source_node_id.in.(${nodeIds.join(",")}),target_node_id.in.(${nodeIds.join(",")})`);
      await server.from("knowledge_nodes").delete().in("id", nodeIds);
    }
    if (created.storagePath) await server.storage.from("course-materials").remove([created.storagePath]);
    if (created.jobId) {
      const prefix = `jobs/${created.jobId}`;
      const attempts = await server.storage.from("material-parser-artifacts").list(prefix);
      for (const attempt of attempts.data ?? []) {
        const files = await server.storage.from("material-parser-artifacts").list(`${prefix}/${attempt.name}`);
        if (files.data?.length) await server.storage.from("material-parser-artifacts").remove(files.data.map((file) => `${prefix}/${attempt.name}/${file.name}`));
      }
    }
    if (created.userId) await server.auth.admin.deleteUser(created.userId);
  }
}
