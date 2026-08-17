import { describe, expect, it } from "vitest";
import { canDesignCourse, canLearn, canManageCourses, canManageKnowledgeDomains, canUseCourseDesignFeatures } from "./capabilities";
import type { MockSession, UserRole } from "./types";

const session=(role:UserRole,capabilities:MockSession["capabilities"]=[]):MockSession=>({userId:role,name:role,email:`${role}@example.test`,role,capabilities,createdAt:"2026-08-15T00:00:00Z"});
describe("role capability matrix",()=>{
  it.each([["student",true,false,false,false],["teacher",true,true,true,false],["admin",true,true,true,true]] as const)("maps %s with no additive capabilities",(role,learn,manage,design,domains)=>{const current=session(role);expect(canLearn(current)).toBe(learn);expect(canManageCourses(current)).toBe(manage);expect(canDesignCourse(current)).toBe(design);expect(canManageKnowledgeDomains(current)).toBe(domains);});
  it("keeps legacy global Domain administrators compatible",()=>{const current=session("student",["global-domain-admin"]);expect(canManageCourses(current)).toBe(true);expect(canDesignCourse(current)).toBe(true);expect(canManageKnowledgeDomains(current)).toBe(true);});
  it("shows Course design features only to authorized users in Design mode",()=>{
    expect(canUseCourseDesignFeatures(session("student"),"learn")).toBe(false);
    expect(canUseCourseDesignFeatures(session("student"),"design")).toBe(false);
    expect(canUseCourseDesignFeatures(session("teacher"),"learn")).toBe(false);
    expect(canUseCourseDesignFeatures(session("teacher"),"design")).toBe(true);
    expect(canUseCourseDesignFeatures(session("admin"),"learn")).toBe(false);
    expect(canUseCourseDesignFeatures(session("admin"),"design")).toBe(true);
  });
});
