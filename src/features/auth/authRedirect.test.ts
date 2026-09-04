import { describe, expect, it } from "vitest";
import { authGateState, resolveAuthRedirect } from "./authRedirect";

describe("progressive auth return destination", () => {
  it("preserves the attempted internal route through login", () => {
    const state = authGateState({ pathname: "/courses/course/materials/material", search: "?segment=page-3", hash: "#focus" });
    expect(resolveAuthRedirect(state)).toBe("/courses/course/materials/material?segment=page-3#focus");
  });

  it("rejects external or backslash destinations", () => {
    expect(resolveAuthRedirect({ from: { pathname: "https://evil.example" } })).toBe("/");
    expect(resolveAuthRedirect({ from: { pathname: "//evil.example" } })).toBe("/");
    expect(resolveAuthRedirect({ from: { pathname: "/\\evil.example" } })).toBe("/");
  });
});
