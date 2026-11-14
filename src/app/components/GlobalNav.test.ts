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

describe("GlobalNav fixed learner rail", () => {
  it("shows only Home to guests", () => {
    expect(getPrimaryNavigationItems(null).map((item) => item.id)).toEqual(["home"]);
  });
  it("always shows the full learner set to logged-in learners", () => {
    expect(getPrimaryNavigationItems(session("student")).map((item) => item.id)).toEqual(["home", "works", "records", "archive"]);
  });
  it("adds Teaching for teachers and Admin for admins after the learner set", () => {
    expect(getPrimaryNavigationItems(session("teacher")).map((item) => item.id)).toEqual(["home", "works", "records", "archive", "teaching"]);
    expect(getPrimaryNavigationItems(session("admin")).map((item) => item.id)).toEqual(["home", "works", "records", "archive", "teaching", "admin"]);
  });
  it("uses the new user-facing labels and paths in a fixed order", () => {
    expect(getPrimaryNavigationItems(session("student")).map((item) => [item.label, item.to])).toEqual([["首页", "/"], ["作品", "/works"], ["记录", "/records"], ["地图", "/archive"]]);
  });
  it("does not infer a teaching or admin entry from capabilities the session does not have", () => {
    const restricted = session("student", []);
    expect(getPrimaryNavigationItems(restricted).some((item) => item.id === "teaching" || item.id === "admin")).toBe(false);
    const domainAdmin = session("student", ["global-domain-admin"]);
    expect(getPrimaryNavigationItems(domainAdmin).map((item) => item.id)).toContain("admin");
  });
});
