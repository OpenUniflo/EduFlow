import { apiRequest } from "@/shared/api/apiClient";

export type AssignmentSubmissionReview = {
  learnerUserId: string;
  learnerName: string;
  courseId: string;
  assignmentId: string;
  status: "submitted" | "accepted";
  submittedAt?: string;
  acceptedAt?: string;
};

export class ApiLearnerStateService {
  startMaterial(courseId: string, materialId: string, nodeId: string) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-material", courseId, materialId, nodeId }) }); }
  startAssignment(courseId: string, assignmentId: string) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-assignment", courseId, assignmentId }) }); }
  submitAssignment(courseId: string, assignmentId: string, deterministicAccepted = false) { return apiRequest<{ status: string; accepted: boolean }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "submit-assignment", courseId, assignmentId, deterministicAccepted }) }); }
  listAssignmentSubmissions(courseId?: string) { return apiRequest<{ submissions: AssignmentSubmissionReview[] }>(`/api/learning${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`); }
  acceptAssignment(courseId: string, assignmentId: string, learnerUserId: string) { return apiRequest<{ status: "accepted"; accepted: true }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "accept-assignment", courseId, assignmentId, learnerUserId }) }); }
}
