import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError } from "./http.js";

export function dataOrThrow<T>(data: T | null, error: PostgrestError | null, operation: string): T {
  if (error) throw new ApiError(500, error.code, `${operation} failed: ${error.code}`);
  return data as T;
}

export async function allRows(query: { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }> }, operation: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 500) {
    const result = await query.range(from, from + 499);
    const page = dataOrThrow(result.data as Record<string, unknown>[] | null, result.error, operation);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
