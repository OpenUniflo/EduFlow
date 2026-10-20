import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createUserSupabase } from "./_lib/supabase.js";
import { ApiError, handleApi, json } from "./_lib/http.js";
import { handleWorkflowV2 } from "./_lib/workflowV2.js";

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { user } = await createUserSupabase(request);
  try { if (await handleWorkflowV2(request, response, user.id)) return; }
  catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const details = error.details as { diagnostics?: unknown; requestId?: string; clientRequestId?: string; draftGeneration?: number; scope?: string } | undefined;
    json(response, error.status, { error: { code: error.code, message: error.message, ...(details ? { details } : {}), ...(details?.diagnostics ? { diagnostics: details.diagnostics } : {}), requestId: details?.requestId ?? crypto.randomUUID(), ...(details?.clientRequestId ? { clientRequestId: details.clientRequestId } : {}), ...(details?.draftGeneration !== undefined ? { draftGeneration: details.draftGeneration } : {}) } });
    return;
  }
  throw new ApiError(404, "NOT_FOUND", "Unknown Workflow resource");
});
