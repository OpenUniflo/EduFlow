import type { Course } from "../types";

/** Personal Courses are owner-visible only; management authority applies only to Standard Courses. */
export function isCourseVisibleToViewer(course: Course, userId?: string, canManageStandard = false) {
  if (course.courseType === "personal") return Boolean(userId && course.ownerUserId === userId);
  return course.lifecycle === "published" || canManageStandard;
}
