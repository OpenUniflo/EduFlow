import { beforeEach, describe, expect, it } from "vitest";
import { clearCourseOrigin, courseTransitionCss, readCourseOrigin, rememberCourseOrigin } from "./courseTransition";

describe("course scene transition geometry", () => {
  beforeEach(() => clearCourseOrigin("course-a"));

  it("replays the clicked origin rectangle and never invents one", () => {
    expect(readCourseOrigin("course-a")).toBeNull();
    rememberCourseOrigin("course-a", { left: 120, top: 80, width: 304, height: 168 });
    expect(readCourseOrigin("course-a")).toEqual({ left: 120, top: 80, width: 304, height: 168 });
    const css = courseTransitionCss(readCourseOrigin("course-a"));
    expect(css?.transform).toContain("translate(120px, 80px)");
    expect(css?.transform).toContain("scale(0.2111111111111111, 0.175)");
  });

  it("stores only presentation numbers and ignores malformed values", () => {
    rememberCourseOrigin("course-a", { left: 10, top: 20, width: 0, height: 0 });
    expect(readCourseOrigin("course-a")?.width).toBe(0);
    rememberCourseOrigin("course-a", null);
    expect(readCourseOrigin("course-a")?.left).toBe(10);
  });
});
