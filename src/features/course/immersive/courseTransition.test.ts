import { beforeEach, describe, expect, it } from "vitest";
import { clearArchiveCourseView, clearCourseOrigin, courseTransitionCss, readArchiveCourseView, readCourseOrigin, rememberArchiveCourseView, rememberCourseOrigin } from "./courseTransition";

describe("course scene transition geometry", () => {
  beforeEach(() => { clearCourseOrigin("course-a"); clearArchiveCourseView("course-a"); });

  it("replays the clicked origin rectangle and never invents one", () => {
    expect(readCourseOrigin("course-a")).toBeNull();
    rememberCourseOrigin("course-a", { left: 120, top: 80, width: 304, height: 168 });
    expect(readCourseOrigin("course-a")).toEqual({ left: 120, top: 80, width: 304, height: 168 });
    const css = courseTransitionCss(readCourseOrigin("course-a"));
    expect(css?.transform).toContain("translate(120px, 80px)");
    expect(css?.transform).toContain("scale(0.2111111111111111, 0.175)");
  });

  it("restores the exact Archive course-plane camera after the course", () => {
    expect(readArchiveCourseView("course-a")).toBeNull();
    rememberArchiveCourseView("course-a", { position: [12, 34, 560], target: [1, 2, 0] });
    expect(readArchiveCourseView("course-a")).toEqual({ position: [12, 34, 560], target: [1, 2, 0] });
    clearArchiveCourseView("course-a");
    expect(readArchiveCourseView("course-a")).toBeNull();
  });

  it("stores only presentation numbers and ignores malformed values", () => {
    rememberCourseOrigin("course-a", { left: 10, top: 20, width: 0, height: 0 });
    expect(readCourseOrigin("course-a")?.width).toBe(0);
    rememberCourseOrigin("course-a", null);
    expect(readCourseOrigin("course-a")?.left).toBe(10);
  });
});
