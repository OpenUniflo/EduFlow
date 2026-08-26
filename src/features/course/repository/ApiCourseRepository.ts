import type { CourseRepository } from "./CourseRepository";
import { validateCourseIntegrity, validateCourseRuntime, type CourseRuntimeData } from "../runtime/courseRuntime";
import { globalKnowledgeAccess, userKnowledgeAccess, type KnowledgeRepository } from "@/features/knowledge/repository/KnowledgeRepository";
import { apiRequest } from "@/shared/api/apiClient";

export class ApiCourseRepository implements CourseRepository {
  private runtimes: CourseRuntimeData[] = [];

  constructor(private readonly knowledgeRepository: KnowledgeRepository) {}

  async hydrate(userId?: string) {
    const result = await apiRequest<{ courses: CourseRuntimeData[] }>("/api/courses");
    const access = userId ? userKnowledgeAccess(userId) : globalKnowledgeAccess;
    result.courses.forEach((runtime) => runtime.course.lifecycle === "draft"
      ? validateCourseIntegrity(runtime, this.knowledgeRepository, access)
      : validateCourseRuntime(runtime, this.knowledgeRepository, access));
    this.runtimes = result.courses;
  }

  listCourseRuntimes() {
    return this.runtimes;
  }

  getCourse(courseId: string) {
    return this.runtimes.find((runtime) => runtime.course.id === courseId) ?? null;
  }
}
