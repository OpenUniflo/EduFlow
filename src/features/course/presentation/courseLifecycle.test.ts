import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { courseLifecycleStorageKey, getCoursePresentationLifecycle, publishedCourseRuntimes, setCoursePresentationLifecycle } from "./courseLifecycle";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); } };
}
const runtime = (id: string) => ({ course: { id } } as CourseRuntimeData);

describe("Course presentation lifecycle", () => {
  it("defaults repository courses to published", () => {
    expect(getCoursePresentationLifecycle("existing", memoryStorage())).toBe("published");
  });
  it("shows only published courses in Course Center while management retains every lifecycle", () => {
    const storage = memoryStorage({ [courseLifecycleStorageKey("draft")]: "draft", [courseLifecycleStorageKey("published")]: "published", [courseLifecycleStorageKey("archived")]: "archived" });
    const runtimes = [runtime("draft"), runtime("published"), runtime("archived")];
    expect(publishedCourseRuntimes(runtimes, storage).map((item) => item.course.id)).toEqual(["published"]);
    expect(runtimes).toHaveLength(3);
  });
  it("reflects publish and archive transitions", () => {
    const storage = memoryStorage({ [courseLifecycleStorageKey("golden")]: "draft" });
    setCoursePresentationLifecycle("golden", "published", storage);
    expect(publishedCourseRuntimes([runtime("golden")], storage)).toHaveLength(1);
    setCoursePresentationLifecycle("golden", "archived", storage);
    expect(publishedCourseRuntimes([runtime("golden")], storage)).toHaveLength(0);
  });
});
