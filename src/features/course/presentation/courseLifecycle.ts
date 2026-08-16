import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";

export type CoursePresentationLifecycle = "draft" | "published" | "archived";
const LIFECYCLE_PREFIX = "eduflow:course-created:";

export function courseLifecycleStorageKey(courseId: string) { return `${LIFECYCLE_PREFIX}${courseId}`; }

export function getCoursePresentationLifecycle(courseId: string, storage: Pick<Storage, "getItem"> = localStorage): CoursePresentationLifecycle {
  const stored = storage.getItem(courseLifecycleStorageKey(courseId));
  return stored === "draft" || stored === "archived" || stored === "published" ? stored : "published";
}

export function setCoursePresentationLifecycle(courseId: string, lifecycle: CoursePresentationLifecycle, storage: Pick<Storage, "setItem"> = localStorage) {
  storage.setItem(courseLifecycleStorageKey(courseId), lifecycle);
}

export function publishedCourseRuntimes(runtimes: CourseRuntimeData[], storage: Pick<Storage, "getItem"> = localStorage) {
  return runtimes.filter((runtime) => getCoursePresentationLifecycle(runtime.course.id, storage) === "published");
}
