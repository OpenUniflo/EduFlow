import type { CourseRepository } from "./CourseRepository";
import { validateCourseRuntime, type CourseRuntimeData } from "../runtime/courseRuntime";
import { userKnowledgeAccess, type KnowledgeRepository } from "@/features/knowledge/repository/KnowledgeRepository";
import { apiRequest } from "@/shared/api/apiClient";

export class ApiCourseRepository implements CourseRepository {
  private runtimes: CourseRuntimeData[] = [];

  constructor(private readonly knowledgeRepository: KnowledgeRepository) {}

  async hydrate(userId: string) {
    const result = await apiRequest<{ courses: CourseRuntimeData[] }>("/api/courses");
    result.courses.forEach((runtime) => validateCourseRuntime(runtime, this.knowledgeRepository, userKnowledgeAccess(userId)));
    this.runtimes = result.courses;
  }

  listCourseRuntimes() {
    return this.runtimes;
  }

  getCourse(courseId: string) {
    return this.runtimes.find((runtime) => runtime.course.id === courseId) ?? null;
  }
}
