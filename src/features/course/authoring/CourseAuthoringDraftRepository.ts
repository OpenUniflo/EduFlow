import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { CourseAuthoringDraftState } from "./courseAuthoringDraft";

export type PersistedCourseAuthoringDraft = {
  state: CourseAuthoringDraftState;
  previewRuntime: CourseRuntimeData;
  revision: number;
  updatedAt: string;
};

/** Server-backed authority for unpublished Course edits. */
export interface CourseAuthoringDraftRepository {
  getDraft(courseId: string): Promise<PersistedCourseAuthoringDraft | null>;
  saveDraft(courseId: string, input: Omit<PersistedCourseAuthoringDraft, "updatedAt"> & { expectedRevision: number }): Promise<{ revision: number; updatedAt: string }>;
  publish(courseId: string, expectedRevision: number): Promise<{ revision: string }>;
}
