import { describe, expect, it } from "vitest";
import { getPrimaryNavigationItems } from "./GlobalNav";
import { shortDisplayName } from "@/shared/ui/displayName";
import type { MockSession } from "@/features/auth/types";
const session = (role: MockSession["role"], capabilities: MockSession["capabilities"] = []): MockSession => ({ userId: role, name: role, email: `${role}@example.com`, role, capabilities, createdAt: "2026-01-01" });
describe("rail display name", () => {
  it("uses the first word so the full name never clips with an ellipsis", () => {
    expect(shortDisplayName("Local Student")).toBe("Local");
    expect(shortDisplayName("小林")).toBe("小林");
    expect(shortDisplayName("Alexandria")).toBe("A");
    expect(shortDisplayName("  ")).toBe("学习者");
    expect(shortDisplayName("Local Student")).not.toContain("…");
  });
});

const allSignals = { hasLearningRecord: true, hasPracticeActivity: true, hasFirstSegmentComplete: true };
const freshSignals = { hasLearningRecord: false, hasPracticeActivity: false, hasFirstSegmentComplete: false };
const learningSignals = { hasLearningRecord: true, hasPracticeActivity: false, hasFirstSegmentComplete: false };

describe("GlobalNav progressive visibility", () => {
  it("shows only Home to guests and brand-new learners", () => {
    expect(getPrimaryNavigationItems(null).map((item) => item.id)).toEqual(["home"]);
    expect(getPrimaryNavigationItems(session("student"), freshSignals).map((item) => item.id)).toEqual(["home"]);
  });
  it("grows the learner rail from real state", () => {
    expect(getPrimaryNavigationItems(session("student"), learningSignals).map((item) => item.id)).toEqual(["home", "records"]);
    expect(getPrimaryNavigationItems(session("student"), allSignals).map((item) => item.id)).toEqual(["home", "works", "records", "archive"]);
  });
  it("adds Teaching for teachers and Admin for admins regardless of learner state", () => {
    expect(getPrimaryNavigationItems(session("teacher"), freshSignals).map((item) => item.id)).toEqual(["home", "archive", "works", "records", "teaching"]);
    expect(getPrimaryNavigationItems(session("admin"), freshSignals).map((item) => item.id)).toEqual(["home", "archive", "works", "records", "teaching", "admin"]);
  });
  it("uses the new user-facing labels and paths", () => {
    expect(getPrimaryNavigationItems(session("student"), allSignals).map((item) => [item.label, item.to])).toEqual([["首页", "/"], ["作品", "/works"], ["记录", "/records"], ["地图", "/archive"]]);
  });
  it("does not infer a teaching or admin entry from capabilities the session does not have", () => {
    const restricted = session("student", []);
    expect(getPrimaryNavigationItems(restricted, allSignals).some((item) => item.id === "teaching" || item.id === "admin")).toBe(false);
    const domainAdmin = session("student", ["global-domain-admin"]);
    expect(getPrimaryNavigationItems(domainAdmin, allSignals).map((item) => item.id)).toContain("admin");
  });
});
