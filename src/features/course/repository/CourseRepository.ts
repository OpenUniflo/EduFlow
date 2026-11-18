import type { CourseLifecycle } from "../types";
import type { CourseRuntimeData } from "../runtime/courseRuntime";

export interface CourseRepository {
  listCourseRuntimes(): CourseRuntimeData[];
  getCourse(courseId: string): CourseRuntimeData | null;
  /** Apply a server-confirmed lifecycle projection without pretending it was fetched. */
  updateLifecycle(courseId: string, lifecycle: CourseLifecycle): boolean;
}
