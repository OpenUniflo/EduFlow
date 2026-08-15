import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createJsonGenerationClient } from "./_lib/llm.js";
import { readLlmEnvironment } from "./_lib/env.js";
import { createUserSupabase } from "./_lib/supabase.js";
import { analyzeCourseIntent } from "../src/features/course/creation/courseIntent.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  await createUserSupabase(request);
  const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
  const materialNames = Array.isArray(request.body?.materialNames) ? request.body.materialNames.filter((name: unknown): name is string => typeof name === "string" && Boolean(name.trim())).map((name: string) => name.trim()) : [];
  if (!message && !materialNames.length) throw new ApiError(400, "invalid_course_intent_request", "A course description or material is required");
  const result = await analyzeCourseIntent({ message, materialNames }, createJsonGenerationClient(readLlmEnvironment()));
  json(response, 200, { intent: result.intent });
});
