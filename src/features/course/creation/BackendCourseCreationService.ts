import type { CourseCreationService } from "./CourseCreationService";
import type { CourseIntent } from "./courseIntent";
import { apiRequest } from "@/shared/api/apiClient";

/** Course generation belongs to the later AI parsing round; real-data mode must not fake a created Course. */
export class BackendCourseCreationService implements CourseCreationService {
  async analyzeIntent(input: { files: File[]; prompt: string }) {
    const response = await apiRequest<{ intent: CourseIntent }>("/api/course-intent", { method: "POST", body: JSON.stringify({ message: input.prompt, materialNames: input.files.map((file) => file.name) }) });
    return response.intent;
  }

  async createCourse(): Promise<never> {
    throw new Error("课件解析与课程生成尚未开放；本轮仅支持已入库课程与资料。");
  }
}
