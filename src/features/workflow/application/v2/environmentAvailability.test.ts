import { describe, expect, it } from "vitest";
import { environmentAvailability } from "./environmentAvailability";

const local = { environmentRef: "local" };
const hosted = { environmentRef: "hosted" };

describe("environmentAvailability", () => {
  it("keeps loading distinct from an empty catalog", () => {
    expect(environmentAvailability({ status: "loading", environments: [], selectedRef: "" })).toBe("loading");
  });

  it("reports a failed read separately from an empty catalog", () => {
    expect(environmentAvailability({ status: "failed", environments: [], selectedRef: "" })).toBe("error");
  });

  it("treats a loaded empty catalog as unavailable, not unauthorized", () => {
    expect(environmentAvailability({ status: "ready", environments: [], selectedRef: "" })).toBe("unavailable");
  });

  it("requires a selected environment that still exists", () => {
    expect(environmentAvailability({ status: "ready", environments: [local, hosted], selectedRef: "removed" })).toBe("unavailable");
    expect(environmentAvailability({ status: "ready", environments: [local, hosted], selectedRef: "" })).toBe("unavailable");
  });

  it("is ready only when the selected environment is present", () => {
    expect(environmentAvailability({ status: "ready", environments: [local, hosted], selectedRef: "hosted" })).toBe("ready");
  });
});
