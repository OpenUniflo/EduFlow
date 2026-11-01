import { describe, expect, it } from "vitest";
import { isPasswordResetEnabled } from "./passwordReset";

describe("password reset environment gate", () => {
  it("defaults on for local Supabase and off for hosted environments", () => {
    expect(isPasswordResetEnabled(undefined, "http://127.0.0.1:54321")).toBe(true);
    expect(isPasswordResetEnabled(undefined, "http://localhost:54321")).toBe(true);
    expect(isPasswordResetEnabled(undefined, "https://project.supabase.co")).toBe(false);
    expect(isPasswordResetEnabled(undefined, "")).toBe(false);
  });

  it("honours an explicit deployment switch", () => {
    expect(isPasswordResetEnabled("false", "http://127.0.0.1:54321")).toBe(false);
    expect(isPasswordResetEnabled("true", "https://project.supabase.co")).toBe(true);
  });
});
