import { apiRequest } from "@/shared/api/apiClient";
import type { CourseAuthoringDraftRepository, PersistedCourseAuthoringDraft } from "./CourseAuthoringDraftRepository";

export class ApiCourseAuthoringDraftRepository implements CourseAuthoringDraftRepository {
  async getDraft(courseId: string) {
    const result = await apiRequest<{ draft: PersistedCourseAuthoringDraft | null }>(`/api/course-authoring?courseId=${encodeURIComponent(courseId)}`);
    return result.draft;
  }
  async saveDraft(courseId: string, input: Omit<PersistedCourseAuthoringDraft, "updatedAt"> & { expectedRevision: number }) {
    return apiRequest<{ revision: number; updatedAt: string }>(`/api/course-authoring?courseId=${encodeURIComponent(courseId)}`, { method: "PUT", body: JSON.stringify(input) });
  }
  async publish(courseId: string, expectedRevision: number) {
    return apiRequest<{ revision: string }>(`/api/course-authoring?courseId=${encodeURIComponent(courseId)}`, { method: "POST", body: JSON.stringify({ expectedRevision }) });
  }
}
