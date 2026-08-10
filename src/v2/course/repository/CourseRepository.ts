import type { CourseRuntimeData } from "../runtime/courseRuntime";

export interface CourseRepository {
  listCourseRuntimes(): CourseRuntimeData[];
  getCourse(courseId: string): CourseRuntimeData | null;
}
