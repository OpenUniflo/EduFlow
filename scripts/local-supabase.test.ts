import { describe, expect, it } from "vitest";
import { assertLocalSupabaseUrl, LOCAL_ONLY_SUPABASE_ERROR } from "./local-supabase";

describe("assertLocalSupabaseUrl", () => {
  it.each([
    ["http://127.0.0.1:54321", "http://127.0.0.1:54321"],
    ["http://localhost:54321/", "http://localhost:54321"]
  ])("accepts the Local Supabase API origin %s", (input, expected) => {
    expect(assertLocalSupabaseUrl(input)).toBe(expected);
  });

  it.each([
    "https://example.supabase.co",
    "http://example.supabase.co:54321",
    "https://127.0.0.1:54321",
    "http://127.0.0.1:54322",
    "http://127.0.0.1:54321/rest/v1",
    "not-a-url"
  ])("rejects non-local or non-canonical targets: %s", (input) => {
    expect(() => assertLocalSupabaseUrl(input)).toThrow(LOCAL_ONLY_SUPABASE_ERROR);
  });
});
