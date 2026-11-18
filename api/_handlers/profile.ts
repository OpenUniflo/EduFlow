import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";

const MAX_DISPLAY_NAME_LENGTH = 40;

/** Validates the editable subset of the learner's own profile. */
export function parseDisplayName(body: unknown): string {
  const value = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { displayName?: unknown }).displayName
    : undefined;
  const displayName = typeof value === "string" ? value.trim() : "";
  if (!displayName) throw new ApiError(400, "display_name_required", "显示名称不能为空");
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ApiError(400, "display_name_too_long", "显示名称不能超过 40 个字符");
  }
  return displayName;
}

/**
 * Updates only the token owner's profile row.
 *
 * The profile id always comes from the verified session. A browser-supplied id
 * in the body is ignored, so this endpoint can never rename another learner.
 * The write uses the server client because `profiles` intentionally exposes no
 * authenticated update policy; the explicit `id` filter is the authority.
 */
export async function updateOwnDisplayName(
  client: SupabaseClient,
  userId: string,
  body: unknown
): Promise<{ displayName: string }> {
  const displayName = parseDisplayName(body);
  const { data, error } = await client
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("display_name")
    .single();
  const profile = dataOrThrow(data as { display_name: string } | null, error, "Profile display name update");
  if (!profile) throw new ApiError(404, "profile_not_found", "个人资料不存在");
  return { displayName: profile.display_name };
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "PATCH") return methodNotAllowed(response, ["PATCH"]);
  const { user } = await createUserSupabase(request);
  json(response, 200, await updateOwnDisplayName(createServerSupabase(), user.id, request.body));
});
