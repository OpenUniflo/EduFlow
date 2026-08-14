import type { CourseIntent } from "./courseIntent";

export interface CourseCreationService {
  analyzeIntent(input: { files: File[]; prompt: string }): Promise<CourseIntent>;
  createCourse(input: { files: File[]; prompt: string; targetOutcome: string }): Promise<{ courseId: string }>;
}
