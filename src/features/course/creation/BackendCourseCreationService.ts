import type { CourseCreationService } from "./CourseCreationService";

/** Course generation belongs to the later AI parsing round; real-data mode must not fake a created Course. */
export class BackendCourseCreationService implements CourseCreationService {
  async createCourse(): Promise<never> {
    throw new Error("课件解析与课程生成尚未开放；本轮仅支持已入库课程与资料。");
  }
}
