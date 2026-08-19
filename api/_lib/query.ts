import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError } from "./http.js";

export function dataOrThrow<T>(data: T | null, error: PostgrestError | null, operation: string): T {
  if (error) throw new ApiError(500, error.code, `${operation} failed: ${error.code}`);
  return data as T;
}
