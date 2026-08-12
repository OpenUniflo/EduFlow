import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import healthHandler from "../api/health";
import knowledgeHandler from "../api/knowledge";
import coursesHandler from "../api/courses";
import progressHandler from "../api/progress";
import workflowsHandler from "../api/workflows";
import materialsHandler from "../api/materials";
import domainsHandler from "../api/domains";

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

const supabaseUrl = required("SUPABASE_URL");
assert.match(supabaseUrl, /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/, "This verifier refuses to run against a hosted Supabase project");
const secretKey = required("SUPABASE_SECRET_KEY");
const publishableKey = required("VITE_SUPABASE_PUBLISHABLE_KEY");
const server = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Local-${suffix}-Aa1!`;
const emails = [`backend-a-${suffix}@eduflow.local`, `backend-b-${suffix}@eduflow.local`];
const createdUserIds: string[] = [];
let uploadedPath: string | undefined;
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
  assert.deepEqual(courses.body.courses.map((item: any) => item.course.id).sort(), ["agentic-ai", "python-engineering"]);
  assertStatus(await invoke(coursesHandler, "GET", adminUser.token, undefined, { id: "missing-course" }), 404, "unknown course denial");
  const signedPdf = courses.body.courses.flatMap((item: any) => item.materials).find((item: any) => item.source?.kind === "pdf")?.source?.url;
  assert.ok(signedPdf);
  const pdfResponse = await fetch(signedPdf);
  assert.equal(pdfResponse.status, 200);
  assert.equal(new TextDecoder().decode((await pdfResponse.arrayBuffer()).slice(0, 5)), "%PDF-");

  const progressBody = {
    userId: ordinaryUser.user.id,
    courseId: "python-engineering",
    recentLessonId: "PY-L02",
    assignmentStates: { "py-runtime-model": { assignmentId: "py-runtime-model", status: "completed", progress: 100 } },
    materialStates: {}
  };
  assertStatus(await invoke(progressHandler, "PUT", adminUser.token, progressBody), 200, "progress write");
  const adminProgress = await invoke(progressHandler, "GET", adminUser.token);
  assertStatus(adminProgress, 200, "progress read");
  assert.equal(adminProgress.body.courseStates[0].userId, adminUser.user.id, "server must ignore a forged userId");
  const ordinaryProgress = await invoke(progressHandler, "GET", ordinaryUser.token);
  assertStatus(ordinaryProgress, 200, "second-user progress read");
  assert.equal(ordinaryProgress.body.courseStates.length, 0);
  const crossUserRead = await ordinaryUser.client.from("user_course_states").select("*").eq("user_id", adminUser.user.id);
  assert.ifError(crossUserRead.error);
  assert.equal(crossUserRead.data?.length, 0);
  const crossUserWrite = await ordinaryUser.client.from("user_course_states").insert({ user_id: adminUser.user.id, course_id: "agentic-ai" });
  assert.ok(crossUserWrite.error, "RLS must reject cross-user progress writes");

  const workflowId = `local-workflow-${suffix}`;
  const runId = `local-run-${suffix}`;
  const workflowBody = {
    builtinWorkflowIds: [],
    settings: { runtime: "local-verifier" },
    state: {
      workflows: [{ id: workflowId, name: "Local verifier", description: "Persistence proof", nodes: [], edges: [], runOrder: [], result: "", code: "" }],
      activeTemplateId: workflowId,
      schemaSaved: true,
      nodePositions: {},
      stateValues: {},
      runHistory: { [workflowId]: [{ id: runId, workflowId, workflowTemplateId: workflowId, courseId: "python-engineering", assignmentId: "py-runtime-model", workflowName: "Local verifier", createdAt: new Date().toISOString(), status: "success", nodeCount: 0, outputSummary: "Verified", finalState: {}, nodes: [] }] }
    }
  };
  assertStatus(await invoke(workflowsHandler, "PUT", adminUser.token, workflowBody), 200, "workflow write");
  const adminWorkflows = await invoke(workflowsHandler, "GET", adminUser.token);
  assertStatus(adminWorkflows, 200, "workflow read");
  assert.ok(adminWorkflows.body.state.workflows.some((item: any) => item.id === workflowId));
  assert.equal(adminWorkflows.body.state.runHistory[workflowId][0].assignmentId, "py-runtime-model");
  const ordinaryWorkflows = await invoke(workflowsHandler, "GET", ordinaryUser.token);
  assertStatus(ordinaryWorkflows, 200, "second-user workflow read");
  assert.ok(!ordinaryWorkflows.body.state.workflows.some((item: any) => item.id === workflowId));

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

  console.log("Local backend verification passed: Auth, Health, Knowledge, Courses, signed PDF, RLS, Progress, Workflows, upload, and authorization.");
} finally {
  if (uploadedMaterialId) await server.from("materials").delete().eq("course_id", "python-engineering").eq("id", uploadedMaterialId);
  if (uploadedPath) await server.storage.from("course-materials").remove([uploadedPath]);
  for (const userId of createdUserIds) await server.auth.admin.deleteUser(userId);
}
