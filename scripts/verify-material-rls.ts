import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import materialsHandler from "../api/materials";
import { assertLocalSupabaseUrl } from "./local-supabase";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function resolvePublicMaterialSource(courseId: string, materialId: string) {
  let status = 200;
  let body: any;
  const headers: Record<string, string | string[]> = {};
  const response = {
    status(code: number) { status = code; return response; },
    json(value: unknown) { body = value; return response; },
    setHeader(name: string, value: string | string[]) { headers[name] = value; return response; }
  } as unknown as VercelResponse;
  await materialsHandler({ method: "GET", headers: {}, query: { courseId, materialId } } as unknown as VercelRequest, response);
  return { status, body, headers };
}

async function assertVisibility(client: any, fixture: Fixture, visible: boolean, label: string) {
  const course = await client.from("courses").select("id").eq("id", fixture.courseId).maybeSingle();
  const material = await client.from("materials").select("id,storage_path").eq("course_id", fixture.courseId).eq("id", fixture.materialId).maybeSingle();
  const signed = await client.storage.from("course-materials").createSignedUrl(fixture.storagePath, 60);
  assert.ifError(course.error);
  assert.ifError(material.error);
  if (!visible) {
    assert.equal(course.data, null, `${label}: Course metadata must be hidden`);
    assert.equal(material.data, null, `${label}: Material metadata must be hidden`);
    assert.ok(signed.error, `${label}: Storage signing must be denied`);
    return;
  }
  assert.equal(course.data?.id, fixture.courseId, `${label}: Course metadata must be readable`);
  assert.equal(material.data?.id, fixture.materialId, `${label}: Material metadata must be readable`);
  assert.ifError(signed.error);
  assert.ok(signed.data?.signedUrl, `${label}: Storage object must be signable`);
  const response = await fetch(signed.data.signedUrl);
  assert.equal(response.status, 200, `${label}: signed Storage object must be readable`);
  assert.equal(new TextDecoder().decode((await response.arrayBuffer()).slice(0, 5)), "%PDF-", `${label}: Storage object must be the PDF fixture`);
}

type Fixture = {
  courseId: string;
  materialId: string;
  storagePath: string;
  courseType: "standard" | "personal";
  lifecycle: "draft" | "published";
  ownerUserId?: string;
  authorUserId?: string;
};

const supabaseUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
const publishableKey = required("VITE_SUPABASE_PUBLISHABLE_KEY");
const server = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Material-RLS-${suffix}-Aa1!`;
const createdUserIds: string[] = [];
const courseIds: string[] = [];
const storagePaths: string[] = [];

try {
  const users = [];
  for (const account of [{ label: "manager", role: "teacher" }, { label: "owner", role: "student" }, { label: "other", role: "student" }] as const) {
    const email = `material-rls-${account.label}-${suffix}@eduflow.local`;
    const created = await server.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    assert.ok(created.data.user);
    createdUserIds.push(created.data.user.id);
    assert.ifError((await server.from("profiles").upsert({ id: created.data.user.id, display_name: `Material RLS ${account.label}`, role: account.role })).error);
    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert.ifError(signedIn.error);
    users.push({ client, userId: created.data.user.id });
  }
  const [manager, ownerLearner, otherLearner] = users;
  const fixtures: Fixture[] = [
    { courseId: `rls-published-${suffix}`, materialId: `material-published-${suffix}`, storagePath: `shared/rls-published-${suffix}/material.pdf`, courseType: "standard", lifecycle: "published", authorUserId: manager.userId },
    { courseId: `rls-personal-${suffix}`, materialId: `material-personal-${suffix}`, storagePath: `shared/rls-personal-${suffix}/material.pdf`, courseType: "personal", lifecycle: "published", ownerUserId: ownerLearner.userId, authorUserId: ownerLearner.userId },
    { courseId: `rls-draft-${suffix}`, materialId: `material-draft-${suffix}`, storagePath: `shared/rls-draft-${suffix}/material.pdf`, courseType: "standard", lifecycle: "draft", authorUserId: manager.userId }
  ];
  courseIds.push(...fixtures.map((fixture) => fixture.courseId));
  storagePaths.push(...fixtures.map((fixture) => fixture.storagePath));
  for (const fixture of fixtures) {
    const chapterId = `${fixture.courseId}:chapter`;
    const lessonId = `${fixture.courseId}:lesson`;
    assert.ifError((await server.from("courses").insert({ id: fixture.courseId, title: "Material RLS verifier", description: "Temporary local RLS fixture", revision: "rls-1", generation_status: fixture.lifecycle === "draft" ? "draft" : "ready", lifecycle: fixture.lifecycle, course_type: fixture.courseType, owner_user_id: fixture.ownerUserId ?? null, author_user_id: fixture.authorUserId ?? null })).error);
    assert.ifError((await server.from("course_curricula").insert({ course_id: fixture.courseId, id: `${fixture.courseId}:curriculum`, generation_mode: "manual" })).error);
    assert.ifError((await server.from("curriculum_chapters").insert({ course_id: fixture.courseId, id: chapterId, title: "RLS", description: "RLS", display_order: 0, color: "#6078db", outcome: "Verify RLS" })).error);
    assert.ifError((await server.from("curriculum_lessons").insert({ course_id: fixture.courseId, id: lessonId, chapter_id: chapterId, title: "RLS", display_order: 0 })).error);
    assert.ifError((await server.from("materials").insert({ course_id: fixture.courseId, id: fixture.materialId, display_order: 0, title: "RLS PDF", material_type: "pdf", storage_path: fixture.storagePath, page_count: 8 })).error);
  }
  const pdf = await readFile("supabase/course-materials/shared/python-engineering/lesson-02.pdf");
  for (const fixture of fixtures) assert.ifError((await server.storage.from("course-materials").upload(fixture.storagePath, pdf, { contentType: "application/pdf" })).error);

  const [published, personal, draft] = fixtures;
  await assertVisibility(anonymous, published, true, "anonymous + published standard Course");
  await assertVisibility(ownerLearner.client, published, true, "learner + published standard Course");
  await assertVisibility(ownerLearner.client, personal, true, "Personal Course owner");
  await assertVisibility(otherLearner.client, personal, false, "other learner + Personal Course");
  await assertVisibility(manager.client, draft, true, "manager + standard draft Course");
  await assertVisibility(ownerLearner.client, draft, false, "learner + standard draft Course");
  const source = await resolvePublicMaterialSource(published.courseId, published.materialId);
  assert.equal(source.status, 200, "published Material source endpoint must resolve through real anon RLS");
  assert.match(String(source.headers["Cache-Control"]), /no-store/, "Material source endpoint must explicitly prohibit caching");
  assert.ok(source.body.sourceUrl, "Material source endpoint must return a temporary URL");

  console.log("Material RLS verification passed: Course metadata, Material metadata, Storage signing/read, and no-store source resolution across all six visibility scenarios.");
} finally {
  if (courseIds.length) await server.from("courses").delete().in("id", courseIds);
  if (storagePaths.length) await server.storage.from("course-materials").remove(storagePaths);
  for (const userId of createdUserIds) await server.auth.admin.deleteUser(userId);
}
