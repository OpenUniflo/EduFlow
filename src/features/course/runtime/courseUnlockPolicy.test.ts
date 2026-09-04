import { describe, expect, it } from "vitest";
import { evaluatePrerequisiteReachability } from "./courseUnlockPolicy";

describe("shared Course prerequisite eligibility", () => {
  it("keeps Included, Reachable, and learner state distinct", () => {
    expect(evaluatePrerequisiteReachability(undefined, [])).toBe("available");
    expect(evaluatePrerequisiteReachability(undefined, [undefined])).toBe("locked");
    expect(evaluatePrerequisiteReachability(undefined, ["learning"])).toBe("locked");
    expect(evaluatePrerequisiteReachability(undefined, ["mastered"])).toBe("available");
    expect(evaluatePrerequisiteReachability("learning", [undefined])).toBe("learning");
    expect(evaluatePrerequisiteReachability("mastered", [undefined])).toBe("completed");
  });
});
