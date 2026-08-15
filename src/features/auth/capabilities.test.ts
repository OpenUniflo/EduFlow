import { describe, expect, it } from "vitest";
import { canDesignCourse, canLearn, canManageCourses, canManageKnowledgeDomains } from "./capabilities";
import type { MockSession, UserRole } from "./types";

const session=(role:UserRole,capabilities:MockSession["capabilities"]=[]):MockSession=>({userId:role,name:role,email:`${role}@example.test`,role,capabilities,createdAt:"2026-08-15T00:00:00Z"});
describe("role capability matrix",()=>{
  it.each([["student",true,false,false,false],["teacher",true,true,true,false],["admin",true,true,true,true]] as const)("maps %s capabilities",(role,learn,manage,design,domains)=>{const current=session(role,role==="admin"?["global-domain-admin"]:[]);expect(canLearn(current)).toBe(learn);expect(canManageCourses(current)).toBe(manage);expect(canDesignCourse(current)).toBe(design);expect(canManageKnowledgeDomains(current)).toBe(domains);});
  it("keeps legacy global Domain administrators compatible",()=>{const current=session("student",["global-domain-admin"]);expect(canManageCourses(current)).toBe(true);expect(canDesignCourse(current)).toBe(true);expect(canManageKnowledgeDomains(current)).toBe(true);});
});
