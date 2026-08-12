import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase } from "./_lib/supabase.js";
import { handleApi, json, methodNotAllowed } from "./_lib/http.js";

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const startedAt = Date.now();
  const { error } = await createServerSupabase().from("courses").select("id", { count: "exact", head: true });
  if (error) {
    json(response, 503, { ok: false, service: "eduflow-api", database: "unavailable" });
    return;
  }
  json(response, 200, { ok: true, service: "eduflow-api", database: "connected", latencyMs: Date.now() - startedAt });
});
