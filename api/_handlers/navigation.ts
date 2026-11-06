import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { requirePublishedCourse } from "../_lib/courseMembership.js";
import { resolveRecommendationPolicy } from "../_lib/recommendation.js";
import { readNavigationDecision } from "../_lib/navigationDecision.js";

type Row = Record<string, unknown>;

export { fetchAllNavigationRows, fetchNavigationRowsByChunks } from "../_lib/navigationDecision.js";

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "GET" && request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  const { client, user } = await createUserSupabase(request);
  const courseId = typeof request.query.courseId === "string" ? request.query.courseId : "";
  if (!courseId) throw new ApiError(400, "course_id_required", "courseId is required");
  if (request.method === "POST") {
    await requirePublishedCourse(client, courseId);
    const server = createServerSupabase();
    const profileResult = await server.from("profiles").select("role").eq("id", user.id).single();
    const profile = dataOrThrow(profileResult.data as Row | null, profileResult.error, "Policy administrator lookup");
    if (profile?.role !== "admin") throw new ApiError(403, "forbidden", "Administrator role required");
    const key = request.body?.policyKey;
    if (key !== "fixed" && key !== "rule_v1") throw new ApiError(400, "unsupported_policy", "Supported policies: fixed, rule_v1");
    const result = await server.from("course_recommendation_policies").upsert({ course_id: courseId, policy_key: key, updated_by: user.id, updated_at: new Date().toISOString() });
    dataOrThrow(result.data, result.error, "Recommendation policy configuration");
    const policy = resolveRecommendationPolicy(key);
    json(response, 200, { policyKey: policy.key, policyVersion: policy.version });
    return;
  }

  json(response, 200, await readNavigationDecision(client, user.id, courseId));
});
