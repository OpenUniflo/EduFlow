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
  assertStatus(await invoke(knowledgeHandler, "GET"), 401, "anonymous knowledge denial");
  const knowledge = await invoke(knowledgeHandler, "GET", adminUser.token);
  assertStatus(knowledge, 200, "knowledge read");
  assert.equal(knowledge.body.graph.nodes.length, 152);
  assert.equal(knowledge.body.graph.edges.length, 220);
  assert.ok(knowledge.body.governance.domains.length > 0);

  const capabilityUpdate = await server.from("profiles").update({ capabilities: ["global-domain-admin"] }).eq("id", adminUser.user.id);
  assert.ifError(capabilityUpdate.error);

  const courses = await invoke(coursesHandler, "GET", adminUser.token);
  assertStatus(courses, 200, "course read");
  assert.deepEqual(courses.body.courses.map((item: any) => item.course.id).sort(), ["agentic-ai", "agentic-ai-golden", "python-engineering"]);
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

  // Authoring drafts are server-owned, isolated from learners, versioned, and
  // only materialize canonical Course rows during Publish.
  const teacherRole = await server.from("profiles").update({ role: "teacher" }).eq("id", adminUser.user.id);
  assert.ifError(teacherRole.error);
  const manualCourse = await invoke(coursesHandler, "POST", adminUser.token, { title: `Manual ${suffix}`, description: "Created without AI", targetOutcome: "Produce a verifiable manual-course outcome" });
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
  assertStatus(published, 200, "authoring draft publish");
  const noDraft = await invoke(courseAuthoringHandler, "GET", adminUser.token, undefined, { courseId: manualCourseId });
  assertStatus(noDraft, 200, "published draft cleared"); assert.equal(noDraft.body.draft, null);
  const learnerAfterPublish = await invoke(coursesHandler, "GET", ordinaryUser.token);
  assertStatus(learnerAfterPublish, 200, "learner course read after publish"); assert.ok(learnerAfterPublish.body.courses.some((item: any) => item.course.id === manualCourseId));

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
  const authoredPath = { id: authoredPathId, knowledgeId: authoredKnowledgeId, courseId: "agentic-ai-golden", scope: "course", title: "Verifier authored Micro", description: "Draft-only until Publish", mode: "learn", estimatedMinutes: 3, required: true, status: "draft", units: [{ id: `${authoredPathId}:unit`, pathId: authoredPathId, title: "Verifier Unit", position: 0, estimatedMinutes: 3, required: true, steps: [{ id: `${authoredPathId}:step`, kind: "interaction", title: "Verifier choice", body: "Choose the verifiable boundary.", interaction: { type: "choice", options: ["Verifiable boundary", "Memorized title"], correctIndex: 0 }, successFeedback: "Correct", retryFeedback: "Retry" }] }] };
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
  const authoredMicroComplete = await invoke(microHandler, "POST", ordinaryUser.token, { action: "complete-step", pathId: authoredPathId, unitId: authoredPath.units[0].id, stepId: authoredPath.units[0].steps[0].id, answer: "Verifiable boundary" });
  assertStatus(authoredMicroComplete, 200, "second required Micro completion"); assert.equal(authoredMicroComplete.body.completed, true);
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

  console.log("Local backend verification passed: Auth, Health, Knowledge, Courses, Micro progress, learning state, evidence, signed PDF, RLS, Workflows, upload, and authorization.");
} finally {
  if (authoredCourseId) await server.from("courses").delete().eq("id", authoredCourseId);
  if (uploadedMaterialId) await server.from("materials").delete().eq("course_id", "python-engineering").eq("id", uploadedMaterialId);
  if (uploadedPath) await server.storage.from("course-materials").remove([uploadedPath]);
  for (const userId of createdUserIds) await server.auth.admin.deleteUser(userId);
}
