import { agenticAiRuntime } from "../../demo/courses/agenticAiRuntime.seed";
import { pythonEngineeringRuntime } from "../../demo/courses/pythonEngineeringCourse.seed";
import { validateCourseRuntime, type CourseRuntimeData } from "../runtime/courseRuntime";
import type { CourseRepository } from "./CourseRepository";
import { globalKnowledgeAccess, type KnowledgeAccessContext, type KnowledgeRepository } from "../../knowledge/repository/KnowledgeRepository";

export class DemoCourseRepository implements CourseRepository {
  private readonly runtimeById: Map<string, CourseRuntimeData>;

  constructor(knowledgeRepository: KnowledgeRepository, runtimes: CourseRuntimeData[] = [agenticAiRuntime, pythonEngineeringRuntime], access: KnowledgeAccessContext = globalKnowledgeAccess) {
    runtimes.forEach((runtime) => validateCourseRuntime(runtime, knowledgeRepository, access));
    this.runtimeById = new Map(runtimes.map((runtime) => [runtime.course.id, runtime]));
  }

  listCourseRuntimes() { return Array.from(this.runtimeById.values()); }
  getCourse(courseId: string) { return this.runtimeById.get(courseId) ?? null; }
}
