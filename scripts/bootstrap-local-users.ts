import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createClient, type User } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import domainsHandler from "../api/domains";
import knowledgeHandler from "../api/knowledge";
import materialsHandler from "../api/materials";
import progressHandler from "../api/progress";
import { assertLocalSupabaseUrl } from "./local-supabase";

const ADMIN_EMAIL = "local-admin@eduflow.local";
const STUDENT_EMAIL = "local-student@eduflow.local";
const PLACEHOLDER_PASSWORD = "replace-with-local-password";

const ADMIN_KNOWLEDGE = [
  { nodeId: "AG01", courseId: "agentic-ai", status: "mastered", mastery: 100 },
  { nodeId: "H02", courseId: "agentic-ai", status: "mastered", mastery: 92 },
  { nodeId: "P01", courseId: "agentic-ai", status: "mastered", mastery: 88 },
  { nodeId: "P05", courseId: "agentic-ai", status: "mastered", mastery: 86 },
  { nodeId: "A01", courseId: "agentic-ai", status: "learning", mastery: 58 },
  { nodeId: "R03", courseId: "agentic-ai", status: "learning", mastery: 52 },
  { nodeId: "RT01", courseId: "agentic-ai", status: "learning", mastery: 45 },
  { nodeId: "PY01", courseId: "python-engineering", status: "mastered", mastery: 100 },
  { nodeId: "PY06", courseId: "python-engineering", status: "mastered", mastery: 94 },
  { nodeId: "PY34", courseId: "python-engineering", status: "mastered", mastery: 82 },
  { nodeId: "PY45", courseId: "python-engineering", status: "mastered", mastery: 88 },
  { nodeId: "PY57", courseId: "python-engineering", status: "learning", mastery: 55 },
  { nodeId: "PY62", courseId: "python-engineering", status: "learning", mastery: 42 },
  { nodeId: "PY63", courseId: "python-engineering", status: "learning", mastery: 38 }
] as const;

type Handler = (request: VercelRequest, response: VercelResponse) => Promise<void> | void;
type Invocation = { status: number; body: unknown };

function createLocalServer(supabaseUrl: string, secretKey: string) {
  return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type LocalServer = ReturnType<typeof createLocalServer>;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function acceptanceEmail(name: string, expected: string) {
  const value = required(name).trim().toLowerCase();
  if (value !== expected) throw new Error(`${name} must be ${expected}`);
  return value;
}

function acceptancePassword(name: string) {
  const value = required(name);
  if (value === PLACEHOLDER_PASSWORD || value.length < 8) {
    throw new Error(`${name} must be a non-placeholder local password with at least 8 characters`);
  }
  return value;
}

async function invoke(handler: Handler, method: string, token: string, body?: unknown): Promise<Invocation> {
  let status = 200;
  let responseBody: unknown;
  const response = {
    status(code: number) { status = code; return response; },
    json(value: unknown) { responseBody = value; return response; },
    setHeader() { return response; }
  } as unknown as VercelResponse;
  const request = {
    method,
    headers: { authorization: `Bearer ${token}` },
    body,
    query: {}
  } as unknown as VercelRequest;
  await handler(request, response);
  return { status, body: responseBody };
}

async function listUsers(server: LocalServer) {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const result = await server.auth.admin.listUsers({ page, perPage: 1000 });
    assert.ifError(result.error);
    users.push(...result.data.users);
    if (result.data.users.length < 1000) return users;
  }
}

async function ensureUser(
  server: LocalServer,
  email: string,
  password: string,
  displayName: string
) {
  const matches = (await listUsers(server)).filter((user) => user.email?.toLowerCase() === email);
  assert.ok(matches.length <= 1, `Duplicate Local acceptance users found for ${email}`);
  if (matches.length === 0) {
    const created = await server.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName }
    });
    assert.ifError(created.error);
    assert.ok(created.data.user);
    return created.data.user;
  }

  const existing = matches[0];
  const updated = await server.auth.admin.updateUserById(existing.id, {
    email,
    password,
    email_confirm: true,
    user_metadata: { ...existing.user_metadata, display_name: displayName }
  });
  assert.ifError(updated.error);
  assert.ok(updated.data.user);
  return updated.data.user;
}

async function signIn(supabaseUrl: string, publishableKey: string, email: string, password: string, expectedUserId: string) {
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.session);
  assert.equal(signedIn.data.user.id, expectedUserId);
  return signedIn.data.session.access_token;
}

function assertStatus(result: Invocation, expected: number, operation: string) {
  assert.equal(result.status, expected, `${operation}: expected ${expected}, received ${result.status}`);
}

async function verifyKnowledgePrerequisites(server: LocalServer) {
  const nodeIds = ADMIN_KNOWLEDGE.map((state) => state.nodeId);
  let nodes: Array<{ id: string; status: string }> = [];
  let coverages: Array<{ course_id: string; node_id: string }> = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const nodeResult = await server.from("knowledge_nodes").select("id, status").in("id", nodeIds);
    if (nodeResult.error && nodeResult.error.code !== "PGRST205" && nodeResult.error.code !== "42P01") throw nodeResult.error;
    nodes = nodeResult.data ?? [];
    if (nodes.length === nodeIds.length) {
      const coverageResult = await server.from("curriculum_coverages").select("course_id, node_id").in("node_id", nodeIds);
      if (coverageResult.error && coverageResult.error.code !== "PGRST205" && coverageResult.error.code !== "42P01") throw coverageResult.error;
      coverages = coverageResult.data ?? [];
      if (ADMIN_KNOWLEDGE.every((state) => coverages.some(
        (coverage) => coverage.node_id === state.nodeId && coverage.course_id === state.courseId
      ))) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(nodes.length, nodeIds.length, "Every Local Admin knowledge state must reference a real KnowledgeNode");
  assert.ok(nodes.every((node) => node.status === "active"), "Local Admin knowledge states must reference active nodes only");
  for (const state of ADMIN_KNOWLEDGE) {
    assert.ok(
      coverages.some((coverage) => coverage.node_id === state.nodeId && coverage.course_id === state.courseId),
      `${state.nodeId} must be covered by ${state.courseId}`
    );
  }
}

export async function bootstrapLocalUsers() {
  const supabaseUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
  const secretKey = required("SUPABASE_SECRET_KEY");
  const publishableKey = required("VITE_SUPABASE_PUBLISHABLE_KEY");
  const adminEmail = acceptanceEmail("LOCAL_ADMIN_EMAIL", ADMIN_EMAIL);
  const adminPassword = acceptancePassword("LOCAL_ADMIN_PASSWORD");
  const studentEmail = acceptanceEmail("LOCAL_STUDENT_EMAIL", STUDENT_EMAIL);
  const studentPassword = acceptancePassword("LOCAL_STUDENT_PASSWORD");
  const server = createLocalServer(supabaseUrl, secretKey);
  const nodeIds = ADMIN_KNOWLEDGE.map((state) => state.nodeId);
  await verifyKnowledgePrerequisites(server);

  const admin = await ensureUser(server, adminEmail, adminPassword, "Local Admin");
  const student = await ensureUser(server, studentEmail, studentPassword, "Local Student");
  assert.ok(admin.email_confirmed_at);
  assert.ok(student.email_confirmed_at);

  const profiles = await server.from("profiles").upsert([
    { id: admin.id, display_name: "Local Admin", role: "student", capabilities: ["global-domain-admin"] },
    { id: student.id, display_name: "Local Student", role: "student", capabilities: [] }
  ]);
  assert.ifError(profiles.error);

  const knowledgeStates = await server.from("user_knowledge_states").upsert(ADMIN_KNOWLEDGE.map((state) => ({
    user_id: admin.id,
    node_id: state.nodeId,
    status: state.status,
    mastery: state.mastery,
    mastery_origin: "direct",
    source_node_id: null,
    source_node_ids: null,
    evidence: null,
    updated_at: new Date().toISOString()
  })));
  assert.ifError(knowledgeStates.error);

  const adminToken = await signIn(supabaseUrl, publishableKey, adminEmail, adminPassword, admin.id);
  const studentToken = await signIn(supabaseUrl, publishableKey, studentEmail, studentPassword, student.id);
  const knowledge = await invoke(knowledgeHandler, "GET", adminToken);
  assertStatus(knowledge, 200, "Local Admin Knowledge read");
  const governance = (knowledge.body as { governance?: unknown }).governance;
  assert.ok(governance);
  const adminProgress = await invoke(progressHandler, "GET", adminToken);
  assertStatus(adminProgress, 200, "Local Admin progress read");
  const adminProgressNodeIds = new Set((adminProgress.body as { userKnowledge: Array<{ nodeId: string }> }).userKnowledge.map((state) => state.nodeId));
  assert.ok(nodeIds.every((nodeId) => adminProgressNodeIds.has(nodeId)), "Local Admin Personal Atlas states must be available through the Progress API");
  assertStatus(await invoke(progressHandler, "GET", studentToken), 200, "Local Student progress read");

  assertStatus(await invoke(domainsHandler, "PUT", adminToken, governance), 200, "Local Admin Domain mutation");
  assertStatus(await invoke(domainsHandler, "PUT", studentToken, governance), 403, "Local Student Domain mutation denial");
  const uploadRequest = {
    courseId: "python-engineering",
    lessonId: "PY-L02",
    filename: "local-acceptance-check.pdf",
    contentType: "application/pdf",
    size: 1
  };
  assertStatus(await invoke(materialsHandler, "POST", adminToken, uploadRequest), 200, "Local Admin Material authorization");
  assertStatus(await invoke(materialsHandler, "POST", studentToken, uploadRequest), 403, "Local Student Material authorization denial");

  const verifiedProfiles = await server.from("profiles").select("id, display_name, role, capabilities").in("id", [admin.id, student.id]);
  assert.ifError(verifiedProfiles.error);
  assert.deepEqual(verifiedProfiles.data?.find((profile) => profile.id === admin.id), {
    id: admin.id,
    display_name: "Local Admin",
    role: "student",
    capabilities: ["global-domain-admin"]
  });
  assert.deepEqual(verifiedProfiles.data?.find((profile) => profile.id === student.id), {
    id: student.id,
    display_name: "Local Student",
    role: "student",
    capabilities: []
  });
  const verifiedStates = await server.from("user_knowledge_states").select("node_id").eq("user_id", admin.id).in("node_id", nodeIds);
  assert.ifError(verifiedStates.error);
  assert.equal(verifiedStates.data?.length, ADMIN_KNOWLEDGE.length);

  const finalUsers = await listUsers(server);
  assert.equal(finalUsers.filter((user) => user.email?.toLowerCase() === adminEmail).length, 1);
  assert.equal(finalUsers.filter((user) => user.email?.toLowerCase() === studentEmail).length, 1);

  console.log(`Local admin ready: ${adminEmail}`);
  console.log(`Local student ready: ${studentEmail}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await bootstrapLocalUsers();
}
