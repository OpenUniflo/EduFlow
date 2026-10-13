import { apiRequest } from "@/shared/api/apiClient";
import type { AssignmentAttemptResult, AssignmentResponse } from "@/shared/learning/assignmentAttempt";
import type { NavigationDecision } from "@/shared/learning/navigation";

export type AssignmentSubmissionReview = {
  learnerUserId: string;
  learnerName: string;
  courseId: string;
  assignmentId: string;
  status: "submitted" | "accepted";
  submittedAt?: string;
  acceptedAt?: string;
  attemptId?: string;
  actionRunId?: string;
  attemptNumber?: number;
  response?: AssignmentResponse;
};

export class ApiLearnerStateService {
  startMaterial(courseId: string, materialId: string, nodeId: string) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-material", courseId, materialId, nodeId }) }); }
  startAssignment(courseId: string, assignmentId: string, actionRunId?: string, conversation = false) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-assignment", courseId, assignmentId, actionRunId, conversation }) }); }
  submitAssignment(courseId: string, assignmentId: string, response: AssignmentResponse, idempotencyKey = crypto.randomUUID(), actionRunId?: string, conversation = false) { return apiRequest<AssignmentAttemptResult & { status: string; accepted: boolean; feedback: { code: string; message: string } }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "submit-assignment", courseId, assignmentId, response, idempotencyKey, actionRunId, conversation }) }); }
  getAssignmentResult(courseId: string, assignmentId: string, actionRunId?: string) { return apiRequest<{ result: (AssignmentAttemptResult & { accepted: boolean; feedback: { code: string; message: string }; evaluatedAt: string; response: AssignmentResponse }) | null }>(`/api/learning?courseId=${encodeURIComponent(courseId)}&assignmentId=${encodeURIComponent(assignmentId)}${actionRunId ? `&actionRunId=${encodeURIComponent(actionRunId)}` : ''}`); }
  listAssignmentSubmissions(courseId?: string) { return apiRequest<{ submissions: AssignmentSubmissionReview[] }>(`/api/learning${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`); }
  acceptAssignment(courseId: string, assignmentId: string, learnerUserId: string, attemptId?: string) { return apiRequest<{ status: "accepted"; accepted: true }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "accept-assignment", courseId, assignmentId, learnerUserId, attemptId }) }); }
  getNavigation(courseId: string) { return apiRequest<NavigationDecision>(`/api/navigation?courseId=${encodeURIComponent(courseId)}`); }
}
