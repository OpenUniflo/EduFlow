import { apiRequest } from "@/shared/api/apiClient";
import type { CourseAuthoringDraftRead, CourseAuthoringDraftRepository, PersistedCourseAuthoringDraft } from "./CourseAuthoringDraftRepository";

export class ApiCourseAuthoringDraftRepository implements CourseAuthoringDraftRepository {
  async getDraft(courseId: string) {
    return apiRequest<CourseAuthoringDraftRead>(`/api/course-authoring?courseId=${encodeURIComponent(courseId)}`);
  }
  async saveDraft(courseId: string, input: Omit<PersistedCourseAuthoringDraft, "updatedAt"> & { expectedRevision: number }) {
    return apiRequest<{ revision: number; updatedAt: string }>(`/api/course-authoring?courseId=${encodeURIComponent(courseId)}`, { method: "PUT", body: JSON.stringify(input) });
  }
  async publish(courseId: string, expectedRevision: number) {
    return apiRequest<{ revision: string }>(`/api/course-authoring?courseId=${encodeURIComponent(courseId)}`, { method: "POST", body: JSON.stringify({ expectedRevision }) });
  }
}
