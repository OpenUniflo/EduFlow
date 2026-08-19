import { describe,expect,it } from "vitest";
import { getPrimaryNavigationItems } from "./GlobalNav";
import type { MockSession } from "@/features/auth/types";
const session=(role:MockSession["role"],capabilities:MockSession["capabilities"]=[]):MockSession=>({userId:role,name:role,email:`${role}@example.com`,role,capabilities,createdAt:"2026-01-01"});
describe("GlobalNav permissions",()=>{
  it("shows only learner workspaces to students",()=>expect(getPrimaryNavigationItems(session("student")).map((item)=>item.id)).toEqual(["learning","explore","courses","canvas"]));
  it("adds Teaching for teachers",()=>expect(getPrimaryNavigationItems(session("teacher")).map((item)=>item.id)).toEqual(["learning","explore","courses","canvas","teaching"]));
  it("adds Teaching and System for admins",()=>expect(getPrimaryNavigationItems(session("admin")).map((item)=>item.id)).toEqual(["learning","explore","courses","canvas","teaching","system"]));
});
