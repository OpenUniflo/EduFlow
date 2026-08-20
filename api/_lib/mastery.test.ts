import { describe, expect, it } from "vitest";
import { preferCourseRequiredPaths } from "./mastery";

describe("required Learn Path resolution",()=>{
  it("uses Course-specific required paths without also requiring Global paths",()=>{
    expect(preferCourseRequiredPaths([{id:"course"}],[{id:"global"}])).toEqual([{id:"course"}]);
  });
  it("falls back to Global required paths when the Course has none",()=>{
    expect(preferCourseRequiredPaths([],[{id:"global"}])).toEqual([{id:"global"}]);
  });
  it("never combines Course and Global requirements",()=>{
    expect(preferCourseRequiredPaths([{id:"course-a"},{id:"course-b"}],[{id:"global"}]).map((path)=>path.id)).toEqual(["course-a","course-b"]);
  });
  it("preserves the existing no-required-path behavior",()=>{
    expect(preferCourseRequiredPaths([],[])).toEqual([]);
  });
});
