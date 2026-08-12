import type { PostgrestError } from "@supabase/supabase-js";

export function dataOrThrow<T>(data: T | null, error: PostgrestError | null, operation: string): T {
  if (error) throw new Error(`${operation} failed: ${error.code}`);
  return data as T;
}
