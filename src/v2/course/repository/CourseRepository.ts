import type { CourseSummary } from "../../types";
import type { CourseRuntimeData } from "../runtime/courseRuntime";

export interface CourseRepository {
  listCourses(): CourseSummary[];
  listCourseRuntimes(): CourseRuntimeData[];
  getCourse(courseId: string): CourseRuntimeData | null;
}
