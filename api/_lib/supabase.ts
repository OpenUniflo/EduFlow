import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { ApiError, bearerToken } from "./http";
import { readServerEnvironment } from "./env";

const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } } as const;

export function createServerSupabase(): SupabaseClient {
  const env = readServerEnvironment();
  return createClient(env.supabaseUrl, env.supabaseSecretKey, options);
}

export async function createUserSupabase(request: VercelRequest): Promise<{ client: SupabaseClient; user: User; token: string }> {
  const token = bearerToken(request);
  const env = readServerEnvironment();
  const client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthorized", "The session is invalid or expired");
  return { client, user: data.user, token };
}

export async function ensureProfile(user: User) {
  const displayName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
  const { error } = await createServerSupabase().from("profiles").upsert({ id: user.id, display_name: displayName }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`Profile initialization failed: ${error.code}`);
}

export async function requireCapability(user: User, capability: string) {
  const { data, error } = await createServerSupabase().from("profiles").select("capabilities").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Profile capability query failed: ${error.code}`);
  if (!data?.capabilities?.includes(capability)) throw new ApiError(403, "forbidden", `${capability} capability is required`);
}
