import type { CourseCreationService } from "@/features/course/creation/CourseCreationService";

/** Demo adapter. A production adapter will persist a newly generated runtime. */
export class DemoCourseCreationService implements CourseCreationService {
  async analyzeIntent(input: { prompt: string }) {
    const targetOutcome = input.prompt.trim();
    return targetOutcome
      ? { status: "ready" as const, targetOutcome }
      : { status: "needs_clarification" as const, clarificationQuestion: "你希望学生完成课程后最终能够做出什么？", recommendedOptions: ["完成一个可运行的项目", "掌握核心方法并能独立应用", "以理论理解和分析为主"] };
  }

  async createCourse() {
    return { courseId: "agentic-ai" };
  }
}
