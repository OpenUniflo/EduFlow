import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase, requireCapability } from "./_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";
import { dataOrThrow } from "./_lib/query.js";

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { user } = await createUserSupabase(request);
  await requireCapability(user, "global-domain-admin");
  const jobId = typeof request.query.id === "string" ? request.query.id : undefined;
  if (!jobId) throw new ApiError(400, "missing_job_id", "Parsing job id is required");
  const server = createServerSupabase();
  if (request.method === "GET") {
    const result = await server.from("material_parsing_jobs").select("*").eq("id", jobId).maybeSingle();
    if (result.error) throw new Error(`Material parsing job query failed: ${result.error.message}`);
    if (!result.data) throw new ApiError(404, "parsing_job_not_found", "Material parsing job not found");
    json(response, 200, { job: result.data });
    return;
  }
  if (request.method === "POST") {
    const current = await server.from("material_parsing_jobs").select("status").eq("id", jobId).maybeSingle();
    if (current.error || !current.data) throw new ApiError(404, "parsing_job_not_found", "Material parsing job not found");
    if (!["failed", "completed"].includes(current.data.status)) throw new ApiError(409, "parsing_job_not_retryable", "Only failed or completed parsing jobs can be queued again");
    const result = await server.from("material_parsing_jobs")
      .update({ status: "pending", error_code: null, error_message: null, completed_at: null, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", current.data.status)
      .select("id, status, attempt")
      .single();
    json(response, 200, { job: dataOrThrow(result.data, result.error, "Material parsing job retry") });
    return;
  }
  return methodNotAllowed(response, ["GET", "POST"]);
});
