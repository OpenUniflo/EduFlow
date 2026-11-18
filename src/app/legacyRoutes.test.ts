import { describe, expect, it } from "vitest";
import { resolveLegacyRoute } from "./legacyRoutes";

describe("P1 route redirect table", () => {
  it("moves Explore to Archive", () => {
    expect(resolveLegacyRoute("/explore", "")).toBe("/archive");
    expect(resolveLegacyRoute("/explore", "?focus=k1")).toBe("/archive?focus=k1");
  });
  it("moves the Course Center list to the Archive course overlay and keeps course subroutes untouched", () => {
    expect(resolveLegacyRoute("/courses", "")).toBe("/archive?panel=courses");
    expect(resolveLegacyRoute("/courses/", "?query=rag")).toBe("/archive?query=rag&panel=courses");
    expect(resolveLegacyRoute("/courses/c1", "")).toBe("/");
    expect(resolveLegacyRoute("/courses/c1/assignments/a1", "")).toBe("/");
  });
  it("moves every workflow path to its works counterpart", () => {
    expect(resolveLegacyRoute("/workflows", "")).toBe("/works");
    expect(resolveLegacyRoute("/workflows/", "")).toBe("/works");
    expect(resolveLegacyRoute("/workflows", "?scope=personal&page=2")).toBe("/works?scope=personal&page=2");
    expect(resolveLegacyRoute("/workflows/wf-1", "")).toBe("/works/wf-1");
    expect(resolveLegacyRoute("/workflows/wf-1", "?courseId=c1&assignmentId=a1")).toBe("/works/wf-1?courseId=c1&assignmentId=a1");
  });
  it("moves System to Admin and keeps query context", () => {
    expect(resolveLegacyRoute("/system", "")).toBe("/admin");
    expect(resolveLegacyRoute("/system/domains", "?domainId=d1")).toBe("/admin?domainId=d1");
    expect(resolveLegacyRoute("/admin/domains", "?nodeId=k1")).toBe("/admin?nodeId=k1");
  });
  it("retires messages and keeps the old teaching alias", () => {
    expect(resolveLegacyRoute("/messages", "")).toBe("/");
    expect(resolveLegacyRoute("/messages/session-1", "?x=1")).toBe("/?x=1");
    expect(resolveLegacyRoute("/course-management", "?courseId=c1")).toBe("/teaching?courseId=c1");
  });
  it("routes Profile to the single Personal Knowledge view", () => {
    expect(resolveLegacyRoute("/profile", "?focus=k1")).toBe("/?focus=k1&view=knowledge");
  });
});
