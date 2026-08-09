import type { CourseCreationService } from "../../course/creation/CourseCreationService";

/** Demo adapter. A production adapter will persist a newly generated runtime. */
export class DemoCourseCreationService implements CourseCreationService {
  async createCourse() {
    return { courseId: "agentic-ai" };
  }
}
