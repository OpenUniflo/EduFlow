import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import healthHandler from "../api/health";
import knowledgeHandler from "../api/knowledge";
import coursesHandler from "../api/_handlers/courses";
import courseAuthoringHandler from "../api/_handlers/course-authoring";
import progressHandler from "../api/_handlers/progress";
import microHandler from "../api/_handlers/micro";
import learningHandler from "../api/_handlers/learning";
import workflowsHandler from "../api/workflows";
import materialsHandler from "../api/materials";
import domainsHandler from "../api/domains";
import assistantHandler from "../api/assistant";
import { assertLocalSupabaseUrl } from "./local-supabase";

type Handler = (request: VercelRequest, response: VercelResponse) => Promise<void> | void;
type Invocation = { status: number; body: any; headers: Record<string, string | string[]> };

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function invoke(handler: Handler, method: string, token?: string, body?: unknown, query: Record<string, string> = {}): Promise<Invocation> {
  let status = 200;
  let responseBody: unknown;
  const headers: Record<string, string | string[]> = {};
  const response = {
    status(code: number) { status = code; return response; },
    json(value: unknown) { responseBody = value; return response; },
    setHeader(name: string, value: string | string[]) { headers[name] = value; return response; }
  } as unknown as VercelResponse;
  const request = {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
    query
  } as unknown as VercelRequest;
  await handler(request, response);
  return { status, body: responseBody, headers };
}

function assertStatus(result: Invocation, expected: number, operation: string) {
  assert.equal(result.status, expected, `${operation}: expected ${expected}, received ${result.status} (${JSON.stringify(result.body)})`);
}

function workflowRun(workflowId: string, id: string, createdAt: string, provenance = true) {
  return {
    id, workflowId, workflowTemplateId: workflowId,
    ...(provenance ? { courseId: "python-engineering", assignmentId: "py-runtime-model" } : {}),
    workflowName: "Local verifier", createdAt, status: "success", nodeCount: 0,
    outputSummary: id, finalState: {}, nodes: []
  };
}

const supabaseUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
const publishableKey = required("VITE_SUPABASE_PUBLISHABLE_KEY");
const server = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Local-${suffix}-Aa1!`;
const emails = [`backend-a-${suffix}@eduflow.local`, `backend-b-${suffix}@eduflow.local`];
const createdUserIds: string[] = [];
let uploadedPath: string | undefined;
let authoredCourseId: string | undefined;
const uploadedMaterialId = `local-backend-${suffix}`;

try {
  const users = [];
  for (const [index, email] of emails.entries()) {
    const created = await server.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Local Verifier ${index + 1}` } });
    assert.ifError(created.error);
    assert.ok(created.data.user);
    createdUserIds.push(created.data.user.id);
    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert.ifError(signedIn.error);
    assert.ok(signedIn.data.session);
    users.push({ client, token: signedIn.data.session.access_token, user: signedIn.data.user });
  }
  const [adminUser, ordinaryUser] = users;

  assertStatus(await invoke(healthHandler, "GET"), 200, "health");
  const publicKnowledge = await invoke(knowledgeHandler, "GET");
  assertStatus(publicKnowledge, 200, "anonymous public Knowledge read");
  assert.ok(publicKnowledge.body.graph.nodes.length > 0);
  assert.ok(publicKnowledge.body.graph.nodes.every((node: any) => node.scope === "global" && node.status === "active"));
  assert.equal(publicKnowledge.body.profile, null);
  assert.deepEqual(publicKnowledge.body.governance.candidates, []);
  assert.deepEqual(publicKnowledge.body.governance.proposals, []);
  const publicCourses = await invoke(coursesHandler, "GET");
  assertStatus(publicCourses, 200, "anonymous Published Course read");
  assert.ok(publicCourses.body.courses.length > 0);
  assert.ok(publicCourses.body.courses.every((item: any) => item.course.lifecycle === "published"));
  const publicMicro = await invoke(microHandler, "GET");
  assertStatus(publicMicro, 200, "anonymous published Micro read");
  assert.ok(publicMicro.body.paths.length > 0);
  assert.deepEqual(publicMicro.body.pathProgress, []);
  assertStatus(await invoke(progressHandler, "GET"), 401, "anonymous progress denial");
  assertStatus(await invoke(learningHandler, "GET"), 401, "anonymous learner state denial");
  assertStatus(await invoke(courseAuthoringHandler, "GET", undefined, undefined, { courseId: "agentic-ai" }), 401, "anonymous authoring denial");
  assertStatus(await invoke(assistantHandler, "GET"), 401, "anonymous Assistant denial");
  const knowledge = await invoke(knowledgeHandler, "GET", adminUser.token);
  assertStatus(knowledge, 200, "knowledge read");
  assert.ok(knowledge.body.graph.nodes.length >= publicKnowledge.body.graph.nodes.length);
  assert.ok(knowledge.body.graph.edges.length >= publicKnowledge.body.graph.edges.length);
  assert.ok(knowledge.body.governance.domains.length > 0);

  const capabilityUpdate = await server.from("profiles").update({ capabilities: ["global-domain-admin"] }).eq("id", adminUser.user.id);
  assert.ifError(capabilityUpdate.error);

  const courses = await invoke(coursesHandler, "GET", adminUser.token);
  assertStatus(courses, 200, "course read");
  assert.deepEqual(courses.body.courses.map((item: any) => item.course.id).sort(), ["agentic-ai", "agentic-ai-golden", "cds525-deep-learning", "python-engineering"]);
  const golden = courses.body.courses.find((item: any) => item.course.id === "agentic-ai-golden");
  assert.ok(golden, "Golden Course must be available through the API");
  assert.equal(golden.chapters.length, 6);
  assert.equal(golden.assignments.length, 37);
  assert.deepEqual(new Set(golden.assignments.map((item: any) => item.experience?.type)), new Set(["answer", "code", "trace", "workflow"]));
  assertStatus(await invoke(coursesHandler, "GET", adminUser.token, undefined, { id: "missing-course" }), 404, "unknown course denial");
  const signedPdf = courses.body.courses.flatMap((item: any) => item.materials).find((item: any) => item.source?.kind === "pdf")?.source?.url;
  assert.ok(signedPdf);
  const pdfResponse = await fetch(signedPdf);
  assert.equal(pdfResponse.status, 200);
  assert.equal(new TextDecoder().decode((await pdfResponse.arrayBuffer()).slice(0, 5)), "%PDF-");

  // Goal planning is product-owned inside the one Assistant boundary. Existing
  // Courses are selected first; Personal Course writes require an explicit action.
  const goalText = "开发包含 RAG、Tool Calling 和 Memory 的 AI Agent";
  const assistantContext = { workspace: "explore", experienceMode: "learn" };
  const goalPlan = await invoke(assistantHandler, "POST", ordinaryUser.token, { action: "plan-goal", goalText, context: assistantContext });
  assertStatus(goalPlan, 200, "Assistant Goal planning");
  assert.equal(goalPlan.body.plan.resolution.status, "ready");
  assert.ok(goalPlan.body.plan.resolution.targetKnowledge.length >= 4);
  assert.ok(goalPlan.body.plan.resolution.targetKnowledge.every((item: any) => knowledge.body.graph.nodes.some((node: any) => node.id === item.id)), "Goal targets must be existing visible Knowledge IDs");
  assert.equal(goalPlan.body.plan.prerequisiteCycleDetected, false);
  const suitableMatch = goalPlan.body.plan.matches.find((match: any) => match.level === "high" || match.level === "medium");
  assert.ok(suitableMatch, "Golden Goal must have an existing suitable Course match");
  const personalBefore = await server.from("courses").select("id").eq("course_type", "personal");
  assert.ifError(personalBefore.error);
  const knowledgeCountBefore = await server.from("knowledge_nodes").select("id", { count: "exact", head: true });
  assert.ifError(knowledgeCountBefore.error);
  const existingSelection = await invoke(assistantHandler, "POST", ordinaryUser.token, { action: "use-existing-course", sessionId: goalPlan.body.sessionId, goalText, courseId: suitableMatch.courseId, context: assistantContext });
  assertStatus(existingSelection, 200, "explicit existing Course selection");
  assert.equal(existingSelection.body.courseId, suitableMatch.courseId, "existing Course identity must be reused");
  const personalAfterExisting = await server.from("courses").select("id").eq("course_type", "personal");
  assert.equal(personalAfterExisting.data?.length, personalBefore.data?.length, "existing Course selection must not create a Personal Course");

  const mediumGoalText = "学习 Docker 和 Deep Learning";
  const mediumPlan = await invoke(assistantHandler, "POST", ordinaryUser.token, { action: "plan-goal", sessionId: goalPlan.body.sessionId, goalText: mediumGoalText, context: assistantContext });
  assertStatus(mediumPlan, 200, "Assistant medium-match Goal planning");
  assert.deepEqual(mediumPlan.body.plan.resolution.targetKnowledge.map((item: any) => item.id).sort(), ["CDS525-K001", "PY95"]);
  assert.equal(mediumPlan.body.plan.matches[0].level, "medium", "cross-Course Goal must expose the customization path");
  const mediumMatch = mediumPlan.body.plan.matches[0];
  const customized = await invoke(assistantHandler, "POST", ordinaryUser.token, { action: "create-personal-course", sessionId: goalPlan.body.sessionId, goalText: mediumGoalText, sourceCourseId: mediumMatch.courseId, context: assistantContext });
  assertStatus(customized, 201, "confirmed Personal Course from existing Course");
  const fromKnowledge = await invoke(assistantHandler, "POST", ordinaryUser.token, { action: "create-personal-course", sessionId: goalPlan.body.sessionId, goalText, context: assistantContext });
  assertStatus(fromKnowledge, 201, "confirmed Personal Course from shared Knowledge");
  const ownerCourses = await invoke(coursesHandler, "GET", ordinaryUser.token);
  for (const personalId of [customized.body.courseId, fromKnowledge.body.courseId]) {
    const personal = ownerCourses.body.courses.find((item: any) => item.course.id === personalId);
    assert.ok(personal, "Personal Course owner must read the normal Course runtime");
    assert.equal(personal.course.courseType, "personal");
    assert.equal(personal.course.ownerUserId, ordinaryUser.user.id);
    assert.ok(personal.targetKnowledge.length > 0);
    assert.deepEqual(personal.assignments, []); assert.deepEqual(personal.materials, []);
  }
  assert.equal(ownerCourses.body.courses.find((item: any) => item.course.id === customized.body.courseId).course.sourceCourseId, mediumMatch.courseId);
  assert.equal(ownerCourses.body.courses.find((item: any) => item.course.id === fromKnowledge.body.courseId).course.sourceCourseId, undefined);
  const otherLearnerCourses = await invoke(coursesHandler, "GET", adminUser.token);
  assert.ok(!otherLearnerCourses.body.courses.some((item: any) => [customized.body.courseId, fromKnowledge.body.courseId].includes(item.course.id)), "another learner must not read Personal Courses");
  const blindAdminUpdate = await adminUser.client.from("courses").update({ title: "unauthorized-personal-update" }).eq("id", customized.body.courseId).select("id");
  assert.ok(blindAdminUpdate.error?.code === "42501" || blindAdminUpdate.data?.length === 0, "an administrator must not blind-update another learner's Personal Course");
  const unchangedPersonal = await server.from("courses").select("title").eq("id", customized.body.courseId).single();
  assert.notEqual(unchangedPersonal.data?.title, "unauthorized-personal-update");
  const anonymousAfterPersonal = await invoke(coursesHandler, "GET");
  assert.ok(!anonymousAfterPersonal.body.courses.some((item: any) => [customized.body.courseId, fromKnowledge.body.courseId].includes(item.course.id)), "anonymous viewer must not read Personal Courses");
  const ownerTargets = await ordinaryUser.client.from("course_target_knowledge").select("course_id,knowledge_id").eq("course_id", customized.body.courseId);
  const otherTargets = await adminUser.client.from("course_target_knowledge").select("course_id,knowledge_id").eq("course_id", customized.body.courseId);
  assert.ok(ownerTargets.data?.length, "owner must read Personal Course target structure");
  assert.deepEqual(otherTargets.data, [], "another learner must not read Personal Course target structure");
  const knowledgeCountAfter = await server.from("knowledge_nodes").select("id", { count: "exact", head: true });
  assert.ifError(knowledgeCountAfter.error);
  assert.equal(knowledgeCountAfter.count, knowledgeCountBefore.count, "Personal Course creation must reuse shared Knowledge without copying nodes");

  // Authoring drafts are server-owned, isolated from learners, versioned, and
  // only materialize canonical Course rows during Publish.
  const teacherRole = await server.from("profiles").update({ role: "teacher" }).eq("id", adminUser.user.id);
  assert.ifError(teacherRole.error);
  const manualCourse = await invoke(coursesHandler, "POST", adminUser.token, { title: `Manual ${suffix}`, description: "Created without AI" });
  assertStatus(manualCourse, 201, "manual course creation");
  const manualCourseId = manualCourse.body.courseId; authoredCourseId = manualCourseId;
  const teacherCourses = await invoke(coursesHandler, "GET", adminUser.token);
  assertStatus(teacherCourses, 200, "teacher reads draft course");
  const manualRuntime = teacherCourses.body.courses.find((item: any) => item.course.id === manualCourseId);
  assert.ok(manualRuntime && manualRuntime.course.lifecycle === "draft");
  assertStatus(await invoke(courseAuthoringHandler, "GET", ordinaryUser.token, undefined, { courseId: manualCourseId }), 403, "learner authoring draft denial");
  const draftState = { schemaVersion: 2, courseId: manualCourseId, addedLinks: [], removedLinks: [], generatedMaterials: [], addedChapters: [], chapterUpdates: {}, removedChapterIds: [], chapterOrder: [], addedKnowledgeNodeIds: [], addedKnowledgeCandidates: [], removedKnowledgeNodeIds: [], knowledgeChapterOverrides: {}, addedDependencies: [], removedDependencyIds: [], manualNodePositions: {} };
  const saveDraft = await invoke(courseAuthoringHandler, "PUT", adminUser.token, { state: draftState, previewRuntime: manualRuntime, expectedRevision: 0 }, { courseId: manualCourseId });
  assertStatus(saveDraft, 200, "teacher authoring draft save"); assert.equal(saveDraft.body.revision, 1);
  const reloadedDraft = await invoke(courseAuthoringHandler, "GET", adminUser.token, undefined, { courseId: manualCourseId });
  assertStatus(reloadedDraft, 200, "teacher authoring draft reload"); assert.equal(reloadedDraft.body.draft.revision, 1);
  assertStatus(await invoke(courseAuthoringHandler, "PUT", adminUser.token, { state: draftState, previewRuntime: manualRuntime, expectedRevision: 0 }, { courseId: manualCourseId }), 409, "authoring draft stale write denial");
  const learnerBeforePublish = await invoke(coursesHandler, "GET", ordinaryUser.token);
  assertStatus(learnerBeforePublish, 200, "learner course read before publish"); assert.ok(!learnerBeforePublish.body.courses.some((item: any) => item.course.id === manualCourseId));
  const published = await invoke(courseAuthoringHandler, "POST", adminUser.token, { expectedRevision: 1 }, { courseId: manualCourseId });
  assertStatus(published, 422, "incomplete authoring draft publish denial");
  const retainedDraft = await invoke(courseAuthoringHandler, "GET", adminUser.token, undefined, { courseId: manualCourseId });
  assertStatus(retainedDraft, 200, "rejected draft retained"); assert.equal(retainedDraft.body.draft.revision, 1);
  const learnerAfterPublish = await invoke(coursesHandler, "GET", ordinaryUser.token);
  assertStatus(learnerAfterPublish, 200, "learner course read after rejected publish"); assert.ok(!learnerAfterPublish.body.courses.some((item: any) => item.course.id === manualCourseId));

  const routeKnowledgeId = golden.curriculumCoverages[0].nodeId;
  const danglingPreview = { ...manualRuntime, curriculumCoverages: [{ id: `${manualCourseId}:coverage:dangling`, courseId: manualCourseId, lessonId: "another-course:lesson", nodeId: routeKnowledgeId, role: "introduce", order: 0 }] };
  const danglingSave = await invoke(courseAuthoringHandler, "PUT", adminUser.token, { state: draftState, previewRuntime: danglingPreview, expectedRevision: 1 }, { courseId: manualCourseId });
  assertStatus(danglingSave, 200, "dangling authoring preview save");
  assertStatus(await invoke(courseAuthoringHandler, "POST", adminUser.token, { expectedRevision: danglingSave.body.revision }, { courseId: manualCourseId }), 500, "dangling Course-owned reference publish denial");

  const routeOnlyPreview = { ...manualRuntime, curriculumCoverages: [{ id: `${manualCourseId}:coverage:1`, courseId: manualCourseId, lessonId: manualRuntime.lessons[0].id, nodeId: routeKnowledgeId, role: "introduce", order: 0 }] };
  const routeOnlySave = await invoke(courseAuthoringHandler, "PUT", adminUser.token, { state: draftState, previewRuntime: routeOnlyPreview, expectedRevision: danglingSave.body.revision }, { courseId: manualCourseId });
  assertStatus(routeOnlySave, 200, "route-only authoring preview save");
  const routeOnlyPublish = await invoke(courseAuthoringHandler, "POST", adminUser.token, { expectedRevision: routeOnlySave.body.revision }, { courseId: manualCourseId });
  assertStatus(routeOnlyPublish, 200, "valid route without targetOutcome publish");
  const publishedRouteOnly = await invoke(coursesHandler, "GET", ordinaryUser.token, undefined, { id: manualCourseId });
  assertStatus(publishedRouteOnly, 200, "learner reads route-only published Course");
  assert.equal(publishedRouteOnly.body.course.course.targetOutcome, undefined);

  // A published Course keeps its existing learner projection until a versioned
  // authoring draft is published.  The same publish transaction materializes
  // authored Micro hierarchy and AssignmentCoverage.
  const publishedBase = teacherCourses.body.courses.find((item: any) => item.course.id === "agentic-ai-golden");
  assert.ok(publishedBase, "published authoring base must exist");
  const authoredKnowledgeId = publishedBase.curriculumCoverages[0].nodeId;
  const authoredPathId = `authored-micro-${suffix}`;
  const authoredAssignmentId = `authored-assignment-${suffix}`;
  const authoringBaseMicro = await invoke(courseAuthoringHandler, "GET", adminUser.token, undefined, { courseId: "agentic-ai-golden" });
  assertStatus(authoringBaseMicro, 200, "published Micro authoring baseline read");
  const authoredPath = { id: authoredPathId, knowledgeId: authoredKnowledgeId, courseId: "agentic-ai-golden", scope: "course", title: "Verifier authored Micro", description: "Draft-only until Publish", mode: "learn", estimatedMinutes: 8, required: true, status: "draft", units: [{ id: `${authoredPathId}:unit`, pathId: authoredPathId, title: "Verifier Unit", position: 0, estimatedMinutes: 8, required: true, steps: [
    { id: `${authoredPathId}:explanation`, kind: "explanation", title: "Verifier explanation", body: "Explain the verifiable boundary." },
    { id: `${authoredPathId}:choice`, kind: "interaction", title: "Verifier choice", body: "Choose the verifiable boundary.", interaction: { type: "choice", options: ["Verifiable boundary", "Memorized title"], correctIndex: 0 }, successFeedback: "Correct", retryFeedback: "Retry" },
    { id: `${authoredPathId}:multiple`, kind: "interaction", title: "Verifier multiple choice", body: "Choose both valid boundaries.", interaction: { type: "multiple-choice", options: ["Input contract", "Output evidence", "Theme"], correctIndexes: [0,1] }, successFeedback: "Correct", retryFeedback: "Retry" },
    { id: `${authoredPathId}:fill`, kind: "interaction", title: "Verifier fill blank", body: "Name the validation component.", interaction: { type: "fill-blank", answers: ["Verifier"] }, successFeedback: "Correct", retryFeedback: "Retry" },
    { id: `${authoredPathId}:ordering`, kind: "interaction", title: "Verifier ordering", body: "Order the boundary.", interaction: { type: "ordering", items: ["Input","Verify","Evidence"], correctOrder: ["Input","Verify","Evidence"] }, successFeedback: "Correct", retryFeedback: "Retry" },
    { id: `${authoredPathId}:trace`, kind: "interaction", title: "Verifier trace", body: "Locate the break.", interaction: { type: "trace", steps: [{ id: "input", label: "Input" },{ id: "skip", label: "Skip validation" }], correctStepId: "skip" }, successFeedback: "Correct", retryFeedback: "Retry" },
    { id: `${authoredPathId}:workflow`, kind: "interaction", title: "Verifier workflow", body: "Build the workflow.", interaction: { type: "mini-workflow", nodes: ["START","VERIFY","END"], correctOrder: ["START","VERIFY","END"] }, successFeedback: "Correct", retryFeedback: "Retry" },
    { id: `${authoredPathId}:h5p`, kind: "interaction", title: "Verifier H5P", body: "Complete the imported content.", interaction: { type: "h5p", contentRef: "golden-h5p-agent-fill-blanks", adapter: "h5p-standalone", completionPolicy: "passed" }, successFeedback: "Correct", retryFeedback: "Retry" },
    { id: `${authoredPathId}:summary`, kind: "summary", title: "Verifier summary", body: "The boundary is persisted." }
  ] }] };
  const authoredAssignment = { id: authoredAssignmentId, courseId: "agentic-ai-golden", order: Math.max(-1, ...publishedBase.assignments.map((item: any) => item.order)) + 1, title: "Verifier authored Assignment", description: "A manually authored Assignment", requirements: ["Provide evidence"], expectedOutput: "Verifiable answer", acceptanceCriteria: ["Meets stated boundary"], mode: "instruction", estimatedMinutes: 5, experience: { type: "answer", prompt: "Provide evidence" } };
  const authoredCoverage = { id: `${authoredAssignmentId}:coverage`, assignmentId: authoredAssignmentId, nodeId: authoredKnowledgeId, role: "assess", required: true };
  const authoredState = { ...draftState, courseId: "agentic-ai-golden", microPathsEdited: true, microPaths: [...authoringBaseMicro.body.baseMicroPaths, authoredPath], assignments: [...publishedBase.assignments, authoredAssignment], assignmentCoverages: [...publishedBase.assignmentCoverages, authoredCoverage] };
  const authoredPreview = { ...publishedBase, assignments: authoredState.assignments, assignmentCoverages: authoredState.assignmentCoverages };
  const preservedAssignment = publishedBase.assignments[0];
  const preservedMaterial = publishedBase.materials[0];
  const preservedSegment = preservedMaterial.segments[0];
  const preservedPath = authoringBaseMicro.body.baseMicroPaths[0];
  const preservedUnit = preservedPath.units[0];
  const preservedStep = preservedUnit.steps[0];
  assert.ifError((await server.from("user_course_states").upsert({ user_id: adminUser.user.id, course_id: "agentic-ai-golden", recent_lesson_id: publishedBase.lessons[0].id })).error);
  assert.ifError((await server.from("user_assignment_states").upsert({ user_id: adminUser.user.id, course_id: "agentic-ai-golden", assignment_id: preservedAssignment.id, status: "started", progress: 25 })).error);
  assert.ifError((await server.from("user_material_states").upsert({ user_id: adminUser.user.id, course_id: "agentic-ai-golden", material_id: preservedMaterial.id, recent_segment_id: preservedSegment.id, viewed_segment_ids: [preservedSegment.id], completed_segment_ids: [], progress: 25 })).error);
  assert.ifError((await server.from("user_micro_path_progress").upsert({ user_id: adminUser.user.id, path_id: preservedPath.id, status: "in_progress", current_unit_id: preservedUnit.id, current_step_id: preservedStep.id, started_at: new Date().toISOString() })).error);
  const learnerOldPublished = await invoke(coursesHandler, "GET", ordinaryUser.token);
  assert.ok(!learnerOldPublished.body.courses.find((item: any) => item.course.id === "agentic-ai-golden").assignments.some((item: any) => item.id === authoredAssignmentId), "learner must not see unpublished Assignment edit");
  const authoredSave = await invoke(courseAuthoringHandler, "PUT", adminUser.token, { state: authoredState, previewRuntime: authoredPreview, expectedRevision: 0 }, { courseId: "agentic-ai-golden" });
  assertStatus(authoredSave, 200, "authored Micro and Assignment draft save");
  const authoringPreview = await invoke(courseAuthoringHandler, "GET", adminUser.token, undefined, { courseId: "agentic-ai-golden" });
  assertStatus(authoringPreview, 200, "authored draft preview read"); assert.ok(authoringPreview.body.draft.state.microPaths.some((item: any) => item.id === authoredPathId)); assert.ok(authoringPreview.body.draft.previewRuntime.assignments.some((item: any) => item.id === authoredAssignmentId));
  const authoredPublish = await invoke(courseAuthoringHandler, "POST", adminUser.token, { expectedRevision: authoredSave.body.revision }, { courseId: "agentic-ai-golden" });
  assertStatus(authoredPublish, 200, "authored Micro and Assignment publish");
  assert.equal((await server.from("user_assignment_states").select("status").eq("user_id", adminUser.user.id).eq("course_id", "agentic-ai-golden").eq("assignment_id", preservedAssignment.id).single()).data?.status, "started", "stable Assignment state must survive republish");
  assert.equal((await server.from("user_material_states").select("recent_segment_id").eq("user_id", adminUser.user.id).eq("course_id", "agentic-ai-golden").eq("material_id", preservedMaterial.id).single()).data?.recent_segment_id, preservedSegment.id, "stable Material state must survive republish");
  assert.equal((await server.from("user_micro_path_progress").select("status").eq("user_id", adminUser.user.id).eq("path_id", preservedPath.id).single()).data?.status, "in_progress", "stable Micro progress must survive republish");
  const learnerNewPublished = await invoke(coursesHandler, "GET", ordinaryUser.token);
  assert.ok(learnerNewPublished.body.courses.find((item: any) => item.course.id === "agentic-ai-golden").assignments.some((item: any) => item.id === authoredAssignmentId), "learner sees authored Assignment only after Publish");
  const invalidH5PPaths=authoredState.microPaths.map((path:any)=>path.id!==authoredPathId?path:{
    ...path,
    units:path.units.map((unit:any)=>({
      ...unit,
      steps:unit.steps.map((step:any)=>step.interaction?.type==="h5p"
        ?{...step,interaction:{...step.interaction,contentRef:"missing-h5p-content"}}
        :step)
    }))
  });
  const invalidH5PState={...authoredState,microPaths:invalidH5PPaths};
  const invalidH5PSave=await invoke(courseAuthoringHandler,"PUT",adminUser.token,{state:invalidH5PState,previewRuntime:authoredPreview,expectedRevision:0},{courseId:"agentic-ai-golden"});
  assertStatus(invalidH5PSave,200,"invalid H5P draft save is allowed before Publish validation");
  assertStatus(await invoke(courseAuthoringHandler,"POST",adminUser.token,{expectedRevision:invalidH5PSave.body.revision},{courseId:"agentic-ai-golden"}),422,"missing published H5P reference blocks Publish");
  assert.ifError((await server.from("course_authoring_drafts").delete().eq("course_id","agentic-ai-golden")).error);

  const micro = await invoke(microHandler, "GET", adminUser.token);
  assertStatus(micro, 200, "database-backed Micro read");
  assert.ok(micro.body.paths.some((item: any) => item.id === authoredPathId), "published authored Micro must be readable by runtime");
  const agentPath = micro.body.paths.find((item: any) => item.id === "golden-micro-AG01");
  assert.ok(agentPath && agentPath.units.length === 2, "Golden Micro hierarchy must be read from the database");
  const unpublishedPathId = `verify-unpublished-micro-${suffix}`;
  const unpublishedUnitId = `${unpublishedPathId}:unit`;
  const unpublishedStepId = `${unpublishedPathId}:step`;
  assert.ifError((await server.from("micro_learning_paths").insert({ id: unpublishedPathId, knowledge_id: "AG01", scope: "global", title: "Unpublished verifier path", mode: "learn", estimated_minutes: 1, required: true, status: "draft" })).error);
  assert.ifError((await server.from("micro_units").insert({ id: unpublishedUnitId, path_id: unpublishedPathId, title: "Unpublished unit", position: 0, estimated_minutes: 1, required: true })).error);
  assert.ifError((await server.from("micro_steps").insert({ id: unpublishedStepId, unit_id: unpublishedUnitId, position: 0, kind: "interaction", title: "Unpublished H5P", content: "Verifier-only unpublished content", interaction: { type: "h5p", contentRef: "golden-h5p-agent-fill-blanks", adapter: "h5p-standalone", completionPolicy: "passed" } })).error);
  assertStatus(await invoke(microHandler, "POST", adminUser.token, { action: "start", pathId: unpublishedPathId }), 404, "unpublished Micro start denial");
  assertStatus(await invoke(microHandler, "POST", adminUser.token, { action: "resolve-h5p", pathId: unpublishedPathId, unitId: unpublishedUnitId, stepId: unpublishedStepId, contentRef: "golden-h5p-agent-fill-blanks" }), 404, "unpublished H5P resolution denial");
  assert.ifError((await server.from("micro_learning_paths").delete().eq("id", unpublishedPathId)).error);
  const submissionFor = (step:any,eventSuffix:string) => {
    const interaction=step.interaction;if(!interaction)return undefined;
    if(interaction.type==="choice")return interaction.options[interaction.correctIndex];
    if(interaction.type==="multiple-choice")return interaction.correctIndexes;
    if(interaction.type==="fill-blank")return interaction.answers[0];
    if(interaction.type==="trace")return interaction.correctStepId;
    if(interaction.type==="ordering"||interaction.type==="mini-workflow")return interaction.correctOrder;
    return {kind:"h5p-result",contentRef:interaction.contentRef,eventId:`verify:${eventSuffix}:${step.id}`,result:{completed:true,success:true,score:1,maxScore:1}};
  };
  assertStatus(await invoke(microHandler, "POST", adminUser.token, { action: "start", pathId: agentPath.id }), 200, "Micro start");
  const h5pStep=agentPath.units.flatMap((unit:any)=>unit.steps).find((step:any)=>step.interaction?.type==="h5p"),h5pUnit=agentPath.units.find((unit:any)=>unit.steps.some((step:any)=>step.id===h5pStep.id));
  assertStatus(await invoke(microHandler,"POST",adminUser.token,{action:"resolve-h5p",pathId:agentPath.id,unitId:h5pUnit.id,stepId:h5pStep.id,contentRef:h5pStep.interaction.contentRef}),200,"H5P content load");
  assertStatus(await invoke(microHandler,"POST",adminUser.token,{action:"resolve-h5p",pathId:agentPath.id,unitId:h5pUnit.id,stepId:h5pStep.id,contentRef:"wrong-content"}),404,"wrong H5P contentRef rejection");
  const incomplete=await invoke(microHandler,"POST",adminUser.token,{action:"complete-step",pathId:agentPath.id,unitId:h5pUnit.id,stepId:h5pStep.id,submission:{kind:"h5p-result",contentRef:h5pStep.interaction.contentRef,eventId:"verify:incomplete",result:{completed:false,success:false}}});assertStatus(incomplete,200,"incomplete H5P result");assert.equal(incomplete.body.correct,false);
  assertStatus(await invoke(microHandler,"POST",adminUser.token,{action:"complete-step",pathId:agentPath.id,unitId:h5pUnit.id,stepId:h5pStep.id,submission:{kind:"h5p-result",contentRef:"wrong-content",eventId:"verify:wrong",result:{completed:true,success:true}}}),400,"unrelated H5P completion rejection");
  let completedResult:any;for(const unit of agentPath.units)for(const step of unit.steps){completedResult=await invoke(microHandler,"POST",adminUser.token,{action:"complete-step",pathId:agentPath.id,unitId:unit.id,stepId:step.id,submission:submissionFor(step,"admin")});assertStatus(completedResult,200,`Micro Step ${step.id}`);assert.equal(completedResult.body.correct,true);}
  assert.equal(completedResult.body.completed,true,"Golden Agent Micro completes after all Native and H5P Steps");
  assertStatus(await invoke(microHandler,"POST",adminUser.token,{action:"complete-step",pathId:agentPath.id,unitId:h5pUnit.id,stepId:h5pStep.id,submission:submissionFor(h5pStep,"admin")}),200,"duplicate H5P completion is idempotent");
  const evidenceCount=await server.from("knowledge_evidence").select("id",{count:"exact",head:true}).eq("user_id",adminUser.user.id).eq("event_type","micro_path_completed").eq("source_entity_id",agentPath.id);assert.ifError(evidenceCount.error);assert.equal(evidenceCount.count,1,"duplicate H5P completion must not duplicate Evidence");
  const startedKnowledge = await invoke(progressHandler, "GET", adminUser.token);
  assertStatus(startedKnowledge, 200, "Learning state after Micro");
  assert.equal(startedKnowledge.body.userKnowledge.find((item: any) => item.nodeId === "AG01")?.status, "learned");
  assert.ok(startedKnowledge.body.userKnowledge.find((item: any) => item.nodeId === "AG01")?.evidence?.some((item: any) => item.type === "micro_path_completed"));

  assertStatus(await invoke(learningHandler, "POST", adminUser.token, { action: "start-knowledge", nodeId: "RT14" }), 200, "explicit Knowledge start");
  assertStatus(await invoke(learningHandler, "POST", adminUser.token, { action: "start-assignment", courseId: "agentic-ai-golden", assignmentId: "golden-knowledge-assignment-RT14" }), 200, "Assignment start");
  const deterministicSubmit = await invoke(learningHandler, "POST", adminUser.token, { action: "submit-assignment", courseId: "agentic-ai-golden", assignmentId: "golden-knowledge-assignment-RT14", deterministicAccepted: true });
  assertStatus(deterministicSubmit, 200, "deterministic Assignment acceptance"); assert.equal(deterministicSubmit.body.status, "accepted");
  const manualAssignmentId = "golden-knowledge-assignment-AG01";
  assertStatus(await invoke(learningHandler, "POST", ordinaryUser.token, { action: "start-assignment", courseId: "agentic-ai-golden", assignmentId: manualAssignmentId }), 200, "learner Assignment start for manual acceptance");
  const submittedAssignment = await invoke(learningHandler, "POST", ordinaryUser.token, { action: "submit-assignment", courseId: "agentic-ai-golden", assignmentId: manualAssignmentId });
  assertStatus(submittedAssignment, 200, "learner Assignment submission for manual acceptance"); assert.equal(submittedAssignment.body.status, "submitted");
  assertStatus(await invoke(learningHandler, "GET", ordinaryUser.token, undefined, { courseId: "agentic-ai-golden" }), 403, "learner Assignment review denial");
  const reviewQueue = await invoke(learningHandler, "GET", adminUser.token, undefined, { courseId: "agentic-ai-golden" });
  assertStatus(reviewQueue, 200, "teacher Assignment review queue");
  assert.ok(reviewQueue.body.submissions.some((item: any) => item.assignmentId === manualAssignmentId && item.learnerUserId === ordinaryUser.user.id && item.status === "submitted"));
  const manualAcceptance = await invoke(learningHandler, "POST", adminUser.token, { action: "accept-assignment", courseId: "agentic-ai-golden", assignmentId: manualAssignmentId, learnerUserId: ordinaryUser.user.id });
  assertStatus(manualAcceptance, 200, "teacher manual Assignment acceptance"); assert.equal(manualAcceptance.body.status, "accepted");
  const acceptedQueue = await invoke(learningHandler, "GET", adminUser.token, undefined, { courseId: "agentic-ai-golden" });
  assert.ok(acceptedQueue.body.submissions.some((item: any) => item.assignmentId === manualAssignmentId && item.status === "accepted"));
  assertStatus(await invoke(learningHandler, "POST", adminUser.token, { action: "accept-assignment", courseId: "agentic-ai-golden", assignmentId: manualAssignmentId, learnerUserId: ordinaryUser.user.id }), 409, "duplicate manual Assignment acceptance denial");
  assertStatus(await invoke(learningHandler, "POST", ordinaryUser.token, { action: "start-assignment", courseId: "agentic-ai-golden", assignmentId: authoredAssignmentId }), 200, "second required Assignment start");
  assertStatus(await invoke(learningHandler, "POST", ordinaryUser.token, { action: "submit-assignment", courseId: "agentic-ai-golden", assignmentId: authoredAssignmentId }), 200, "second required Assignment submission");
  assertStatus(await invoke(learningHandler, "POST", adminUser.token, { action: "accept-assignment", courseId: "agentic-ai-golden", assignmentId: authoredAssignmentId, learnerUserId: ordinaryUser.user.id }), 200, "second required Assignment acceptance");
  assertStatus(await invoke(microHandler, "POST", ordinaryUser.token, { action: "start", pathId: agentPath.id }), 200, "accepted-before-Micro learner start");
  let reverseResult:any;for(const unit of agentPath.units)for(const step of unit.steps){reverseResult=await invoke(microHandler,"POST",ordinaryUser.token,{action:"complete-step",pathId:agentPath.id,unitId:unit.id,stepId:step.id,submission:submissionFor(step,"learner")});assertStatus(reverseResult,200,`accepted-before-Micro ${step.id}`);assert.equal(reverseResult.body.correct,true);}
  assert.equal(reverseResult.body.completed,true,"accepted-before-Micro completion");
  assertStatus(await invoke(microHandler, "POST", ordinaryUser.token, { action: "start", pathId: authoredPathId }), 200, "second required Micro start");
  let authoredMicroComplete:any;for(const step of authoredPath.units[0].steps){authoredMicroComplete=await invoke(microHandler,"POST",ordinaryUser.token,{action:"complete-step",pathId:authoredPathId,unitId:authoredPath.units[0].id,stepId:step.id,submission:submissionFor(step,"authored")});assertStatus(authoredMicroComplete,200,`authored Micro ${step.id}`);assert.equal(authoredMicroComplete.body.correct,true);}
  assert.equal(authoredMicroComplete.body.completed, true, "second required authored Micro completion");
  const reverseProgress = await invoke(progressHandler, "GET", ordinaryUser.token);
  assert.equal(reverseProgress.body.userKnowledge.find((item: any) => item.nodeId === "AG01")?.status, "mastered", "mastery must be recomputed when required Micro completes after Assignment acceptance");

  const progressBody = {
    userId: ordinaryUser.user.id,
    courseId: "python-engineering",
    recentLessonId: "PY-L02",
    assignmentStates: { "py-runtime-model": { assignmentId: "py-runtime-model", status: "submitted", progress: 75 } },
    materialStates: {}
  };
  assertStatus(await invoke(progressHandler, "PUT", adminUser.token, progressBody), 200, "progress write");
  const adminProgress = await invoke(progressHandler, "GET", adminUser.token);
  assertStatus(adminProgress, 200, "progress read");
  assert.equal(adminProgress.body.courseStates[0].userId, adminUser.user.id, "server must ignore a forged userId");
  const ordinaryProgress = await invoke(progressHandler, "GET", ordinaryUser.token);
  assertStatus(ordinaryProgress, 200, "second-user progress read");
  assert.ok(ordinaryProgress.body.courseStates.every((item: any) => item.userId === ordinaryUser.user.id), "manual acceptance must not expose another learner's progress");
  const crossUserRead = await ordinaryUser.client.from("user_course_states").select("*").eq("user_id", adminUser.user.id);
  assert.ifError(crossUserRead.error);
  assert.equal(crossUserRead.data?.length, 0);
  const crossUserWrite = await ordinaryUser.client.from("user_course_states").insert({ user_id: adminUser.user.id, course_id: "agentic-ai" });
  assert.ok(crossUserWrite.error, "RLS must reject cross-user progress writes");

  const workflowId = `local-workflow-${suffix}`;
  const secondWorkflowId = `local-workflow-independent-${suffix}`;
  const runStart = Date.now() - 30_000;
  const workflowRuns = Array.from({ length: 25 }, (_, index) => workflowRun(
    workflowId, `local-run-${suffix}-${index}`, new Date(runStart + index * 1_000).toISOString()
  ));
  const independentRuns = Array.from({ length: 3 }, (_, index) => workflowRun(
    secondWorkflowId, `local-independent-run-${suffix}-${index}`, new Date(runStart + index * 1_000).toISOString(), false
  ));
  const workflowBody = {
    builtinWorkflowIds: [],
    settings: { runtime: "local-verifier" },
    state: {
      workflows: [
        { id: workflowId, name: "Local verifier", description: "Persistence proof", nodes: [], edges: [], runOrder: [], result: "", code: "" },
        { id: secondWorkflowId, name: "Independent verifier", description: "Isolation proof", nodes: [], edges: [], runOrder: [], result: "", code: "" }
      ],
      activeTemplateId: workflowId,
      schemaSaved: true,
      nodePositions: {},
      stateValues: {},
      runHistory: { [workflowId]: workflowRuns, [secondWorkflowId]: independentRuns }
    }
  };
  assertStatus(await invoke(workflowsHandler, "PUT", adminUser.token, workflowBody), 200, "workflow write");
  let adminWorkflows = await invoke(workflowsHandler, "GET", adminUser.token);
  assertStatus(adminWorkflows, 200, "workflow read");
  assert.ok(adminWorkflows.body.state.workflows.some((item: any) => item.id === workflowId));
  assert.equal(adminWorkflows.body.state.runHistory[workflowId].length, 20, "25 persisted runs must be pruned to 20");
  assert.equal(adminWorkflows.body.state.runHistory[workflowId][0].id, workflowRuns[24].id);
  assert.ok(adminWorkflows.body.state.runHistory[workflowId].every((run: any) =>
    run.courseId === "python-engineering" && run.assignmentId === "py-runtime-model" && run.workflowTemplateId === workflowId
  ), "run provenance must survive pruning");
  assert.equal(adminWorkflows.body.state.runHistory[secondWorkflowId].length, 3, "another workflow must not be pruned");
  assert.ok(adminWorkflows.body.state.runHistory[secondWorkflowId].every((run: any) =>
    run.courseId === undefined && run.assignmentId === undefined
  ), "independent runs must not infer assignment provenance");

  const newestRun = workflowRun(workflowId, `local-run-${suffix}-25`, new Date(runStart + 25_000).toISOString());
  workflowBody.state.runHistory[workflowId] = [newestRun, ...adminWorkflows.body.state.runHistory[workflowId]];
  assertStatus(await invoke(workflowsHandler, "PUT", adminUser.token, workflowBody), 200, "workflow 26th run write");
  adminWorkflows = await invoke(workflowsHandler, "GET", adminUser.token);
  assertStatus(adminWorkflows, 200, "workflow reload after 26th run");
  assert.equal(adminWorkflows.body.state.runHistory[workflowId].length, 20);
  assert.equal(adminWorkflows.body.state.runHistory[workflowId][0].id, newestRun.id);
  assert.equal(adminWorkflows.body.state.runHistory[secondWorkflowId].length, 3);
  const adminPersistedRuns = await server.from("workflow_runs").select("id").eq("owner_user_id", adminUser.user.id).eq("workflow_id", workflowId);
  assert.ifError(adminPersistedRuns.error);
  assert.equal(adminPersistedRuns.data?.length, 20, "database must physically retain only 20 runs");

  const ordinaryBody = structuredClone(workflowBody);
  ordinaryBody.state.runHistory = {
    [workflowId]: Array.from({ length: 22 }, (_, index) => workflowRun(
      workflowId, `ordinary-run-${suffix}-${index}`, new Date(runStart + index * 1_000).toISOString(), false
    ))
  };
  assertStatus(await invoke(workflowsHandler, "PUT", ordinaryUser.token, ordinaryBody), 200, "second-user workflow write");
  const ordinaryWorkflows = await invoke(workflowsHandler, "GET", ordinaryUser.token);
  assertStatus(ordinaryWorkflows, 200, "second-user workflow read");
  assert.equal(ordinaryWorkflows.body.state.runHistory[workflowId].length, 20, "second user receives an independent cap");
  const adminAfterOrdinaryWrite = await invoke(workflowsHandler, "GET", adminUser.token);
  assertStatus(adminAfterOrdinaryWrite, 200, "first-user workflow isolation read");
  assert.equal(adminAfterOrdinaryWrite.body.state.runHistory[workflowId].length, 20);
  assert.equal(adminAfterOrdinaryWrite.body.state.runHistory[workflowId][0].id, newestRun.id, "another user must not alter the first user's runs");

  const uploadRequest = { courseId: "python-engineering", lessonId: "PY-L02", filename: "local-verifier.pdf", contentType: "application/pdf", size: 120_000 };
  assertStatus(await invoke(materialsHandler, "POST", ordinaryUser.token, uploadRequest), 403, "non-admin upload denial");
  assertStatus(await invoke(materialsHandler, "POST", adminUser.token, { ...uploadRequest, lessonId: "missing-lesson" }), 404, "unknown lesson denial");
  const upload = await invoke(materialsHandler, "POST", adminUser.token, uploadRequest);
  assertStatus(upload, 200, "signed upload creation");
  uploadedPath = upload.body.path;
  const pdf = await readFile("supabase/course-materials/shared/python-engineering/lesson-02.pdf");
  const uploadResult = await adminUser.client.storage.from("course-materials").uploadToSignedUrl(upload.body.path, upload.body.token, pdf, { contentType: "application/pdf" });
  assert.ifError(uploadResult.error);
  const metadata = {
    courseId: "python-engineering", lessonId: "PY-L02", materialId: uploadedMaterialId, order: 999,
    title: "Local verifier PDF", path: uploadedPath, contentType: "application/pdf", pageCount: 8,
    segments: Array.from({ length: 8 }, (_, index) => ({ id: `${uploadedMaterialId}-page-${index + 1}`, order: index + 1, page: index + 1, title: `Page ${index + 1}` }))
  };
  assertStatus(await invoke(materialsHandler, "PUT", adminUser.token, metadata), 201, "material metadata write");
  const uploadedRow = await server.from("materials").select("id").eq("course_id", "python-engineering").eq("id", uploadedMaterialId).maybeSingle();
  assert.ifError(uploadedRow.error);
  assert.equal(uploadedRow.data?.id, uploadedMaterialId);

  const incompleteMetadata = { ...metadata, materialId: `${uploadedMaterialId}-invalid`, segments: metadata.segments.slice(0, 7) };
  assertStatus(await invoke(materialsHandler, "PUT", adminUser.token, incompleteMetadata), 400, "incomplete PDF metadata denial");
  assertStatus(await invoke(domainsHandler, "PUT", ordinaryUser.token, knowledge.body.governance), 403, "non-admin Domain mutation denial");
  assertStatus(await invoke(domainsHandler, "PUT", adminUser.token, knowledge.body.governance), 200, "admin Domain mutation");

  console.log("Local backend verification passed: Auth, Health, Knowledge, Goal planning, Personal Courses, Course visibility, Micro progress, learning state, evidence, signed PDF, RLS, Workflows, upload, and authorization.");
} finally {
  if (authoredCourseId) await server.from("courses").delete().eq("id", authoredCourseId);
  if (uploadedMaterialId) await server.from("materials").delete().eq("course_id", "python-engineering").eq("id", uploadedMaterialId);
  if (uploadedPath) await server.storage.from("course-materials").remove([uploadedPath]);
  for (const userId of createdUserIds) await server.auth.admin.deleteUser(userId);
}
