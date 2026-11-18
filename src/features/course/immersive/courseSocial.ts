/**
 * Social presence contract for the course scene. There is no social backend
 * yet, so the only implementation is a read-only Feature Preview source
 * injected by `src/app`. Feature code never imports sample data directly.
 */
export type CoursePeerPresence = {
  id: string;
  displayName: string;
  accent: "me" | "orange" | "cyan" | "rose";
  sample: boolean;
  sectionTitle: string;
  sharedCourseIds: readonly string[];
};

export interface CourseSocialRepository {
  readonly kind: "real" | "preview";
  listCoLearners(input: { courseId: string; sectionTitle?: string }): Promise<readonly CoursePeerPresence[]>;
}

export class CoursePreviewReadOnlyError extends Error {
  readonly code = "preview_read_only";
  constructor(readonly operation: string) {
    super(`预览数据源只读：${operation} 不会写入持久状态`);
    this.name = "CoursePreviewReadOnlyError";
  }
}
