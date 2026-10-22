import { describe, expect, it } from "vitest";
import { templateCapabilities, templateRequirements } from "./templateCapabilities";

describe("product template capabilities", () => {
  it("declares model and tool needs for all four product templates", () => {
    const ids = ["product-tech-brief", "product-dependency-health", "product-community-triage", "product-content-review"];
    for (const id of ids) {
      const requirements = templateRequirements(id);
      expect(requirements.length).toBeGreaterThan(0);
      expect(requirements.some(item => item.kind === "model")).toBe(true);
      expect(new Set(requirements.map(item => `${item.kind}:${item.label}`)).size).toBe(requirements.length);
    }
    expect(Object.keys(templateCapabilities)).toEqual(ids);
    expect(templateRequirements("unknown-template")).toEqual([]);
  });
});
