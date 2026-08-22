import { describe,expect,it } from "vitest";
import { resolveLegacyRoute } from "./legacyRoutes";
describe("legacy route compatibility",()=>{
  it("preserves query context while moving old workspaces",()=>{
    expect(resolveLegacyRoute("/course-management","?courseId=c1")).toBe("/teaching?courseId=c1");
    expect(resolveLegacyRoute("/admin/domains","?nodeId=k1")).toBe("/system?nodeId=k1");
  });
  it("routes Profile to the single Personal Knowledge view",()=>expect(resolveLegacyRoute("/profile","?focus=k1")).toBe("/?focus=k1&view=knowledge"));
});
