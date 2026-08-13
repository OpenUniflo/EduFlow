import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase, requireCapability } from "./_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";
import { dataOrThrow } from "./_lib/query.js";
import type { MaterialParsingJob } from "../src/features/material/parsing/types.js";

type MaterialParsingJobRow = {
  id: string;
  course_id: string;
  material_id: string;
  status: MaterialParsingJob["status"];
  attempt: number;
  parser_version: string;
  adapter_version: string;
  raw_artifact_path: string | null;
  normalized_artifact_path: string | null;
  error_code: string | null;
  error_message: string | null;
};

export function toMaterialParsingJob(row: MaterialParsingJobRow): MaterialParsingJob {
  return {
    id: row.id,
    courseId: row.course_id,
    materialId: row.material_id,
    status: row.status,
    attempt: row.attempt,
    parserVersion: row.parser_version,
    adapterVersion: row.adapter_version,
    ...(row.raw_artifact_path ? { rawArtifactPath: row.raw_artifact_path } : {}),
    ...(row.normalized_artifact_path ? { normalizedArtifactPath: row.normalized_artifact_path } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {})
  };
}

export function parsingJobRetryPatch(now: string) {
  return {
    status: "pending" as const,
    source_sha256: null,
    raw_artifact_path: null,
    normalized_artifact_path: null,
    error_code: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    updated_at: now
  };
}

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
    json(response, 200, { job: toMaterialParsingJob(result.data as MaterialParsingJobRow) });
    return;
  }
  if (request.method === "POST") {
    const current = await server.from("material_parsing_jobs").select("status").eq("id", jobId).maybeSingle();
    if (current.error || !current.data) throw new ApiError(404, "parsing_job_not_found", "Material parsing job not found");
    if (!["failed", "completed"].includes(current.data.status)) throw new ApiError(409, "parsing_job_not_retryable", "Only failed or completed parsing jobs can be queued again");
    const result = await server.from("material_parsing_jobs")
      .update(parsingJobRetryPatch(new Date().toISOString()))
      .eq("id", jobId)
      .eq("status", current.data.status)
      .select("*")
      .single();
    const row = dataOrThrow(result.data, result.error, "Material parsing job retry");
    json(response, 200, { job: toMaterialParsingJob(row as MaterialParsingJobRow) });
    return;
  }
  return methodNotAllowed(response, ["GET", "POST"]);
});
