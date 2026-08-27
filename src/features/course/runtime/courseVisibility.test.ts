import { describe, expect, it } from "vitest";
import { isCourseVisibleToViewer } from "./courseVisibility";
import type { Course } from "../types";

const standard = { id: "standard", title: "Standard", description: "Standard", lifecycle: "published", courseType: "standard" } as Course;
const personal = { id: "personal", title: "Personal", description: "Personal", lifecycle: "published", courseType: "personal", ownerUserId: "owner" } as Course;

describe("Course visibility", () => {
  it("keeps Personal Courses owner-visible even after Publish", () => {
    expect(isCourseVisibleToViewer(personal)).toBe(false);
    expect(isCourseVisibleToViewer(personal, "other", true)).toBe(false);
    expect(isCourseVisibleToViewer(personal, "owner")).toBe(true);
  });

  it("allows published Standard Courses and limits Standard drafts to managers", () => {
    expect(isCourseVisibleToViewer(standard)).toBe(true);
    expect(isCourseVisibleToViewer({ ...standard, lifecycle: "draft" })).toBe(false);
    expect(isCourseVisibleToViewer({ ...standard, lifecycle: "draft" }, "teacher", true)).toBe(true);
  });
});
