import { describe, expect, it } from "vitest";
import { readServerEnvironment } from "./env";

describe("server environment", () => {
  it("requires server and publishable Supabase configuration", () => {
    expect(readServerEnvironment({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "server-only",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable"
    })).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseSecretKey: "server-only",
      supabasePublishableKey: "publishable"
    });
  });

  it("does not accept an absent server secret", () => {
    expect(() => readServerEnvironment({ SUPABASE_URL: "url", VITE_SUPABASE_PUBLISHABLE_KEY: "public" })).toThrow(/SUPABASE_SECRET_KEY/);
  });
});
