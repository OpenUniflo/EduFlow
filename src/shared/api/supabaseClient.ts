import { createClient } from "@supabase/supabase-js";

function requiredClientEnv(name: string, value: string | undefined) {
  if (import.meta.env.MODE === "test") return value?.trim() || (name === "VITE_SUPABASE_URL" ? "http://127.0.0.1:54321" : "test-publishable-key");
  if (!value?.trim()) throw new Error(`Missing client environment variable: ${name}`);
  return value;
}

export const supabaseClient = createClient(
  requiredClientEnv("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  requiredClientEnv("VITE_SUPABASE_PUBLISHABLE_KEY", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
);
