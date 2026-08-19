import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertLocalSupabaseUrl } from "../local-supabase";
import { readEmbeddingEnvironment, readLlmEnvironment } from "../../api/_lib/env";
import { createEmbeddingService } from "../../api/_lib/embedding";
import { createJsonGenerationClient } from "../../api/_lib/llm";
import { SupabaseCourseMappingRepository } from "../../api/_lib/courseMappingRepository";
import { runCourseMappingPipeline } from "../../src/features/course/mapping/pipeline";
import { buildCourseMappingPlan } from "../../src/features/course/mapping/mappingPlan";
import { COURSE_MAPPING_PROMPT_VERSION } from "../../src/features/course/mapping/prompts";
import { compareMappingCounts, evaluateCourseMapping, matchGoldOutcomesByAssignmentSet, matchGoldPracticesByKnowledgeSet, type MappingGold } from "../../src/features/course/mapping/evaluation";
import { cosineSimilarity } from "../../src/features/knowledge/generation/retrieval";
import { InMemoryKnowledgeRepository } from "../../src/features/knowledge/repository/InMemoryKnowledgeRepository";
import { userKnowledgeAccess } from "../../src/features/knowledge/repository/KnowledgeRepository";
import { validateCourseRuntime, buildCourseGraphData, type CourseRuntimeData } from "../../src/features/course/runtime/courseRuntime";
import { resolveKnowledgeMaterialEntries } from "../../src/features/material/materialNavigation";
import { buildKnowledgeAssignmentContexts, buildMaterialSegmentProjection } from "../../src/features/material/materialProjection";
import knowledgeHandler from "../../api/knowledge";
import coursesHandler from "../../api/_handlers/courses";
import type { KnowledgeGraph } from "../../src/features/knowledge/types";
import knowledgeNodesGold from "../../fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/knowledge-nodes.json";
import knowledgeMaterialGold from "../../fixtures/phase4-agentic-ai/gold/mapping/chapter-01/knowledge-material-links.json";
import practicesGold from "../../fixtures/phase4-agentic-ai/gold/mapping/chapter-01/practices.json";
import knowledgePracticeGold from "../../fixtures/phase4-agentic-ai/gold/mapping/chapter-01/knowledge-practice-links.json";
import dependencyGold from "../../fixtures/phase4-agentic-ai/gold/mapping/chapter-01/practice-dependencies.json";
import outcomesGold from "../../fixtures/phase4-agentic-ai/gold/mapping/chapter-01/outcomes.json";
import { validateAssignmentDAG } from "../../src/features/course/mapping/assignmentDag";

const OUTPUT = join(import.meta.dirname, "../../tmp/phase4-3-eval");
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function callHandler(handler: (request: VercelRequest, response: VercelResponse) => Promise<void> | void, token: string, query: Record<string, string>) {
  let body: unknown; let status = 0;
  const response = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; }, setHeader() { return this; } } as unknown as VercelResponse;
  await handler({ method: "GET", headers: { authorization: `Bearer ${token}` }, query } as unknown as VercelRequest, response);
  if (status >= 400) throw new Error(`API handoff failed with HTTP ${status}`);
  return body;
}

async function semanticMatches(gold: Array<{ id: string; text: string }>, production: Array<{ id: string; text: string }>, threshold: number) {
  const embedder = createEmbeddingService(readEmbeddingEnvironment());
  const [goldVectors, productionVectors] = await Promise.all([Promise.all(gold.map((item) => embedder.embed(item.text))), Promise.all(production.map((item) => embedder.embed(item.text)))]);
  const pairs = gold.flatMap((left, leftIndex) => production.map((right, rightIndex) => ({ left: left.id, right: right.id, score: cosineSimilarity(goldVectors[leftIndex], productionVectors[rightIndex]) }))).sort((a, b) => b.score - a.score || a.left.localeCompare(b.left) || a.right.localeCompare(b.right));
  const leftUsed = new Set<string>(); const rightUsed = new Set<string>(); const result = new Map<string, string>();
  pairs.forEach((pair) => { if (pair.score >= threshold && !leftUsed.has(pair.left) && !rightUsed.has(pair.right)) { leftUsed.add(pair.left); rightUsed.add(pair.right); result.set(pair.left, pair.right); } });
  return { matches: result, decisions: gold.map((item) => ({ goldId: item.id, productionId: result.get(item.id), score: pairs.find((pair) => pair.left === item.id && pair.right === result.get(item.id))?.score ?? 0 })) };
}

async function semanticScoreMap(gold: Array<{ id: string; text: string }>, production: Array<{ id: string; text: string }>) {
  const embedder = createEmbeddingService(readEmbeddingEnvironment());
  const [goldVectors, productionVectors] = await Promise.all([Promise.all(gold.map((item) => embedder.embed(item.text))), Promise.all(production.map((item) => embedder.embed(item.text)))]);
  return new Map(gold.flatMap((left, leftIndex) => production.map((right, rightIndex) => [`${left.id}:${right.id}`, cosineSimilarity(goldVectors[leftIndex], productionVectors[rightIndex])] as const)));
}

const supabaseUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const server = createClient(supabaseUrl, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
const sourceRunId = argument("--knowledge-run-id");
const requestedTargetOutcome = argument("--target-outcome");
if (!sourceRunId) throw new Error("--knowledge-run-id is required (use a kept real Phase 4.2 run)");
const sourceRun = await server.from("knowledge_generation_runs").select("course_id, owner_user_id, status").eq("id", sourceRunId).maybeSingle();
if (sourceRun.error || !sourceRun.data || sourceRun.data.status !== "completed") throw new Error("A completed Phase 4.2 knowledge run is required");
const courseId = sourceRun.data.course_id; const ownerId = sourceRun.data.owner_user_id;
const env = readLlmEnvironment();
const repository = new SupabaseCourseMappingRepository(server);
async function execute() {
  const prepared = await repository.prepare({ courseId, ownerId, targetOutcome: requestedTargetOutcome, provider: env.llmProvider, model: env.llmModel, promptVersion: COURSE_MAPPING_PROMPT_VERSION, schemaVersions: ["implementation-steps-v1", "course-assignments-v2", "assignment-dependencies-v1"] });
  try {
    const generated = await runCourseMappingPipeline({ runtime: prepared.runtime, knowledgeNodes: prepared.knowledgeNodes, knowledgeEdges: prepared.knowledgeEdges, workflowTemplates: prepared.workflowTemplates, targetOutcome: prepared.runtime.course.targetOutcome as string }, createJsonGenerationClient(env));
    const plan = buildCourseMappingPlan(prepared.runtime, generated);
    await repository.persist(prepared.runId, plan);
    return { prepared, generated, plan };
  } catch (error) { await repository.fail(prepared.runId, error); throw error; }
}
const first = await execute();
const countTables = ["material_knowledge_coverages", "course_assignments", "assignment_coverages", "assignment_dependencies", "chapter_outcomes", "assignment_outcome_compositions", "final_projects", "final_project_outcome_compositions"];
async function counts() { return Object.fromEntries(await Promise.all(countTables.map(async (table) => { const result = await server.from(table).select("id", { count: "exact", head: true }).eq("course_id", courseId); if (result.error) throw new Error(`${table} count failed`); return [table, result.count ?? 0] as const; }))); }
const before = await counts();
const second = await execute();
const after = await counts();

const password = `Phase4-${randomUUID()}`;
const user = await server.auth.admin.getUserById(ownerId); assert(!user.error && user.data.user.email, "Acceptance owner missing");
const passwordUpdate = await server.auth.admin.updateUserById(ownerId, { password }); assert(!passwordUpdate.error, "Acceptance password setup failed");
const login = await server.auth.signInWithPassword({ email: user.data.user.email, password }); assert(!login.error && login.data.session, "Acceptance login failed");
const [knowledgeResponse, courseResponse] = await Promise.all([callHandler(knowledgeHandler, login.data.session.access_token, {}) as Promise<{ graph: KnowledgeGraph }>, callHandler(coursesHandler, login.data.session.access_token, { id: courseId }) as Promise<{ course: CourseRuntimeData }>]);
const runtime = courseResponse.course; const graph = knowledgeResponse.graph; const knowledgeRepository = new InMemoryKnowledgeRepository(graph); const access = userKnowledgeAccess(ownerId);
validateCourseRuntime(runtime, knowledgeRepository, access);
const userState = { userId: ownerId, courseId, assignmentStates: {}, materialStates: {}, updatedAt: new Date().toISOString() };
const skillTree = buildCourseGraphData(runtime, userState, graph);

const sampledGoldIds = new Set(knowledgeMaterialGold.links.map((link) => link.knowledgeNodeId));
const knowledgeGold = knowledgeNodesGold.nodes.filter((node) => sampledGoldIds.has(node.id)).map((node) => ({ id: node.id, text: [node.canonicalTitle, ...node.aliases, node.description, ...node.masteryCriteria].join("。") }));
const knowledgeMatch = await semanticMatches(knowledgeGold, graph.nodes.filter((node) => runtime.curriculumCoverages.some((coverage) => coverage.nodeId === node.id)).map((node) => ({ id: node.id, text: [node.title, ...((node.metadata?.aliases as string[] | undefined) ?? []), node.description, ...node.masteryCriteria].join("。") })), 0.68);
const practiceSemanticScores = await semanticScoreMap(practicesGold.practices.map((practice) => ({ id: practice.id, text: [practice.title, practice.objective, practice.deliverable].join("。") })), runtime.assignments.map((assignment) => ({ id: assignment.id, text: [assignment.title, assignment.description, assignment.expectedOutput].join("。") })));
const practiceMatch = matchGoldPracticesByKnowledgeSet({ knowledgePracticeLinks: knowledgePracticeGold.links, knowledgeNodeIdByGold: knowledgeMatch.matches, assignments: runtime.assignments, assignmentCoverages: runtime.assignmentCoverages, semanticScores: practiceSemanticScores });
const outcomeGoldText = outcomesGold.chapterOutcomes.map((outcome) => ({ id: outcome.id, text: outcome.title }));
const outcomeProductionText = runtime.chapterOutcomes.map((outcome) => ({ id: outcome.id, text: [outcome.title, ...runtime.assignmentOutcomeCompositions.filter((composition) => composition.outcomeId === outcome.id).flatMap((composition) => { const assignment = runtime.assignments.find((item) => item.id === composition.assignmentId); return assignment ? [assignment.title, assignment.description, assignment.projectContribution ?? ""] : []; })].join("。") }));
const outcomeMatch = matchGoldOutcomesByAssignmentSet({ chapterOutcomes: outcomesGold.chapterOutcomes, assignmentIdByGoldPractice: practiceMatch.matches, outcomes: runtime.chapterOutcomes, assignmentOutcomeCompositions: runtime.assignmentOutcomeCompositions, semanticScores: await semanticScoreMap(outcomeGoldText, outcomeProductionText) });
const gold: MappingGold = { knowledgeMaterialLinks: knowledgeMaterialGold.links, knowledgePracticeLinks: knowledgePracticeGold.links, practiceDependencies: dependencyGold.dependencies, chapterOutcomes: outcomesGold.chapterOutcomes, finalProject: outcomesGold.finalProject };
const evaluation = evaluateCourseMapping(runtime, gold, { knowledgeNodeIdByGold: knowledgeMatch.matches, assignmentIdByGoldPractice: practiceMatch.matches, outcomeIdByGold: outcomeMatch.matches, finalProjectIdByGold: new Map([[outcomesGold.finalProject.id, runtime.finalProjects[0]?.id]]) });
const mappedNodeIds = Array.from(knowledgeMatch.matches.values());
const navigation = mappedNodeIds.map((nodeId) => ({ nodeId, entries: resolveKnowledgeMaterialEntries(runtime, nodeId).length, assignments: buildKnowledgeAssignmentContexts(runtime, nodeId, userState).length }));
const segmentProjectionChecks = runtime.materialKnowledgeCoverages.slice(0, 20).map((coverage) => { const material = runtime.materials.find((item) => item.id === coverage.materialId) as CourseRuntimeData["materials"][number]; const projection = buildMaterialSegmentProjection(runtime, material, coverage.segmentId, userState, knowledgeRepository, access, { domains: [], assignments: [], candidates: [], proposals: [], revision: 0 }); const knowledgeAssignments = buildKnowledgeAssignmentContexts(runtime, coverage.nodeId, userState); return { coverageId: coverage.id, hasKnowledge: Boolean(projection?.knowledgeContexts.some((item) => item.nodeId === coverage.nodeId)), noAssignmentLeak: knowledgeAssignments.every((item) => item.nodeId === coverage.nodeId) }; });
const firstStructure = first.generated.steps.map((step) => [...step.knowledgeNodeIds].sort().join("|")).sort();
const secondStructure = second.generated.steps.map((step) => [...step.knowledgeNodeIds].sort().join("|")).sort();
const countComparison = compareMappingCounts(before, after);
const duplicateChecks = { assignmentIds: runtime.assignments.length - new Set(runtime.assignments.map((item) => item.id)).size, assignmentCoveragePairs: runtime.assignmentCoverages.length - new Set(runtime.assignmentCoverages.map((item) => `${item.assignmentId}:${item.nodeId}`)).size, dependencyPairs: runtime.assignmentDependencies.length - new Set(runtime.assignmentDependencies.map((item) => `${item.sourceAssignmentId}:${item.targetAssignmentId}`)).size, finalProjectOverflow: Math.max(0, runtime.finalProjects.length - 1) };
const dag = validateAssignmentDAG(second.generated.assignments, second.generated.dependencies);
const firstAssignmentIdByStep = new Map(first.generated.steps.map((step, index) => [step.semanticKey, first.plan.assignments[index]?.id]));
const secondAssignmentIdByStep = new Map(second.generated.steps.map((step, index) => [step.semanticKey, second.plan.assignments[index]?.id]));
const stableIdentityForSharedGroups = Array.from(firstAssignmentIdByStep).filter(([key]) => secondAssignmentIdByStep.has(key)).every(([key, id]) => secondAssignmentIdByStep.get(key) === id);
const expectedAfter = { material_knowledge_coverages: second.plan.materialKnowledgeCoverages.length, course_assignments: second.plan.assignments.length, assignment_coverages: second.plan.assignmentCoverages.length, assignment_dependencies: second.plan.assignmentDependencies.length, chapter_outcomes: second.plan.chapterOutcomes.length, assignment_outcome_compositions: second.plan.assignmentOutcomeCompositions.length, final_projects: second.plan.finalProjects.length, final_project_outcome_compositions: second.plan.finalProjectOutcomeCompositions.length };
const matchesSecondPlanCounts = Object.entries(expectedAfter).every(([key, expected]) => after[key] === expected);
const noUncontrolledDuplicateData = matchesSecondPlanCounts && Object.values(duplicateChecks).every((count) => count === 0);
const report = { datasetVersion: "mapping-gold-v0.1", sourceKnowledgeRunId: sourceRunId, courseId, targetOutcome: runtime.course.targetOutcome, knowledgeCount: skillTree.knowledgeNodes.length, stepCount: second.generated.steps.length, assignmentCount: runtime.assignments.length, runs: [first.prepared.runId, second.prepared.runId], steps: second.generated.steps.map((step) => ({ ...step, knowledge: step.knowledgeNodeIds.map((nodeId) => ({ id: nodeId, title: graph.nodes.find((node) => node.id === nodeId)?.title })) })), assignments: runtime.assignments.map((assignment) => ({ id: assignment.id, title: assignment.title, knowledgeNodeIds: runtime.assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id).map((coverage) => coverage.nodeId) })), finalProject: runtime.finalProjects[0], matching: { knowledge: knowledgeMatch.decisions, practices: practiceMatch.decisions, outcomes: outcomeMatch.decisions }, upstreamBlocked: practiceMatch.upstreamBlocked, evaluation, idempotency: { ...countComparison, expectedAfter, matchesSecondPlanCounts, noUncontrolledDuplicateData, duplicateChecks, structuralDrift: JSON.stringify(firstStructure) !== JSON.stringify(secondStructure), stableIdentityForSharedGroups, run1StepGroups: firstStructure, run2StepGroups: secondStructure }, graph: { dependencyCount: runtime.assignmentDependencies.length, selfEdges: dag.selfEdges.length, danglingEdges: dag.danglingEdges.length, duplicateEdges: dag.duplicateEdges.length, cycle: dag.cycles, redundantTransitiveEdges: dag.redundantTransitiveEdges.length }, product: { knowledgeNavigation: navigation, segmentProjectionChecks, skillTree: { knowledgeNodeCount: skillTree.knowledgeNodes.length, assignmentCount: skillTree.assignmentSummary.assignmentCount } } };
mkdirSync(OUTPUT, { recursive: true }); writeFileSync(join(OUTPUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
