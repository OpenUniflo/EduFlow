export interface CourseCreationService {
  createCourse(input: { files: File[]; prompt: string }): Promise<{ courseId: string }>;
}
