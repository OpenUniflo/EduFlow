import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { CourseAuthoringDraftState } from "./courseAuthoringDraft";
import type { MicroLearningPath } from "@/features/learning/micro/microLearning";

export type PersistedCourseAuthoringDraft = {
  state: CourseAuthoringDraftState;
  previewRuntime: CourseRuntimeData;
  revision: number;
  updatedAt: string;
};

export type CourseAuthoringDraftRead = {
  draft: PersistedCourseAuthoringDraft | null;
  /** Published paths used as the complete base for a course-scoped Micro edit. */
  baseMicroPaths: MicroLearningPath[];
};

/** Server-backed authority for unpublished Course edits. */
export interface CourseAuthoringDraftRepository {
  getDraft(courseId: string): Promise<CourseAuthoringDraftRead>;
  saveDraft(courseId: string, input: Omit<PersistedCourseAuthoringDraft, "updatedAt"> & { expectedRevision: number }): Promise<{ revision: number; updatedAt: string }>;
  publish(courseId: string, expectedRevision: number): Promise<{ revision: string }>;
}
