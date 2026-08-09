import { agenticAiRuntime } from "../../demo/courses/agenticAiRuntime.seed";
import { pythonEngineeringRuntime } from "../../demo/courses/pythonEngineeringCourse.seed";
import type { CourseSummary } from "../../types";
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
  listCourses(): CourseSummary[] {
    return this.listCourseRuntimes().map((runtime) => ({
      id: runtime.course.id,
      title: runtime.course.title,
      subtitle: runtime.course.subtitle,
      description: runtime.course.description,
      accentColor: runtime.course.accentColor,
      status: "not-started",
      progress: 0,
      chapterCount: runtime.chapters.length,
      lessonCount: runtime.lessons.length,
      knowledgeNodeCount: new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId)).size,
      assignmentCount: runtime.assignments.length
    }));
  }
}
