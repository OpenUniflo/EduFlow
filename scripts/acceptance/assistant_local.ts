import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const apiBase = process.env.ASSISTANT_ACCEPTANCE_URL ?? "http://127.0.0.1:5173";
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !publishableKey) throw new Error("Local Supabase environment is required");

async function request(path: string, init?: RequestInit) {
  const deployment = process.env.VERCEL_DEPLOYMENT;
  if (!deployment) return fetch(`${apiBase}${path}`, init);
  const directory = mkdtempSync(join(tmpdir(), "assistant-acceptance-"));
  const headerFile = join(directory, "headers"); const bodyFile = join(directory, "body");
  try {
    const args = ["exec", "vercel", "curl", path, "--deployment", deployment, "--", "--silent", "--show-error", "--dump-header", headerFile, "--output", bodyFile];
    if (init?.method) args.push("--request", init.method);
    new Headers(init?.headers).forEach((value, key) => args.push("--header", `${key}: ${value}`));
    if (typeof init?.body === "string") args.push("--data-binary", init.body);
    execFileSync("pnpm", args, { stdio: ["ignore", "ignore", "inherit"] });
    const headerText = readFileSync(headerFile, "utf8"); const body = readFileSync(bodyFile, "utf8");
    const blocks = headerText.trim().split(/\r?\n\r?\n/); const lines = blocks[blocks.length - 1]?.split(/\r?\n/) ?? [];
    const status = Number(lines[0]?.match(/\s(\d{3})\s/)?.[1] ?? 0); const headers = new Headers();
    for (const line of lines.slice(1)) { const separator = line.indexOf(":"); if (separator > 0) headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim()); }
    return new Response(body, { status, headers });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

async function tokenFor(emailName: "LOCAL_STUDENT_EMAIL" | "LOCAL_ADMIN_EMAIL", passwordName: "LOCAL_STUDENT_PASSWORD" | "LOCAL_ADMIN_PASSWORD") {
  const email = process.env[emailName]; const password = process.env[passwordName];
  if (!email || !password) throw new Error(`${emailName} and ${passwordName} are required`);
  const client = createClient(supabaseUrl!, publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Local sign-in failed: ${error?.message ?? emailName}`);
  return data.session.access_token;
}

async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await request(path, { ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `${path} failed: ${response.status}`);
  return body;
}

async function send(token: string, input: Record<string, unknown>) {
  const response = await request("/api/assistant", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error(`Assistant send failed: ${response.status} ${await response.text()}`);
  const sessionId = response.headers.get("X-Assistant-Session-Id");
  const text = await response.text();
  if (!sessionId || !text.trim()) throw new Error("Assistant response lacked session or text");
  return { sessionId, text };
}

const unauthenticated = await request("/api/assistant");
if (unauthenticated.status !== 401) throw new Error(`Unauthenticated request returned ${unauthenticated.status}`);

const student = await tokenFor("LOCAL_STUDENT_EMAIL", "LOCAL_STUDENT_PASSWORD");
const admin = await tokenFor("LOCAL_ADMIN_EMAIL", "LOCAL_ADMIN_PASSWORD");
const knowledgePayload = await api<{ graph: { nodes: Array<{ id: string; title: string; status: string }> } }>("/api/knowledge", student);
const activeKnowledge = knowledgePayload.graph.nodes.filter((node) => node.status === "active");
const knowledge = activeKnowledge.find((node) => /RAG|retrieval/i.test(node.title)) ?? activeKnowledge[0];
if (!knowledge) throw new Error("No visible Knowledge fixture exists");
const first = await send(student, { message: "必须调用 getCurrentContext。告诉我当前 Knowledge 的准确标题，并简要说明它是什么。", context: { workspace: "explore", experienceMode: "learn", knowledgeId: knowledge.id } });
if (!first.text.includes(knowledge.title)) throw new Error(`Knowledge context answer did not mention ${knowledge.title}: ${first.text}`);

const courses = await api<{ courses: Array<{ course: { id: string; lifecycle: string }; materials: Array<{ id: string; segments: Array<{ id: string; title?: string }> }> }> }>("/api/courses", student);
const withMaterial = courses.courses.find((runtime) => runtime.course.lifecycle === "published" && runtime.materials.some((material) => material.segments.length));
if (!withMaterial) throw new Error("No published Material fixture exists");
const material = withMaterial.materials.find((item) => item.segments.length)!; const segment = material.segments[0];
const second = await send(student, { sessionId: first.sessionId, message: "必须调用 getCurrentContext。当前这一页在讲什么？", context: { workspace: "material", experienceMode: "learn", courseId: withMaterial.course.id, materialId: material.id, segmentId: segment.id } });
if (second.sessionId !== first.sessionId) throw new Error("Cross-page message did not preserve the session");

const nextAction = await send(student, { sessionId: first.sessionId, message: "我下一步应该学什么？请给出正式个性化 Next Action。", context: { workspace: "learning", experienceMode: "learn", knowledgeId: knowledge.id } });
if (!/Navigation|导航|尚未|不能|不可用|未建立/i.test(nextAction.text)) throw new Error("Next Action boundary was not stated");

const history = await api<{ messages: Array<{ role: string; context: { workspace: string } }> }>(`/api/assistant?sessionId=${first.sessionId}`, student);
if (history.messages.length !== 6 || history.messages[0]?.context.workspace !== "explore" || history.messages[2]?.context.workspace !== "material") throw new Error("Persisted cross-page history is invalid");

const foreign = await request(`/api/assistant?sessionId=${first.sessionId}`, { headers: { Authorization: `Bearer ${admin}` } });
if (foreign.status !== 404) throw new Error(`Cross-user session read returned ${foreign.status}`);

console.log(JSON.stringify({ acceptance: "pass", sessionId: first.sessionId, knowledgeId: knowledge.id, courseId: withMaterial.course.id, materialId: material.id, segmentId: segment.id, messages: history.messages.length, unauthenticatedStatus: unauthenticated.status, crossUserStatus: foreign.status }));
