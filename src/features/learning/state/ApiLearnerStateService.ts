import { apiRequest } from "@/shared/api/apiClient";
import type { AssignmentAttemptResult, AssignmentEvaluationResponse, AssignmentFeedback, AssignmentResponse, AssignmentResult } from "@/shared/learning/assignmentAttempt";
import type { NavigationDecision } from "@/shared/learning/navigation";
import type { MyPracticeSubmission } from "@/shared/learning/practiceSubmission";

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

export type LearnerStateRefresher = (userId: string) => Promise<void>;

export class ApiLearnerStateService {
  constructor(private readonly refreshLearnerState: LearnerStateRefresher = async () => undefined) {}
  startMaterial(courseId: string, materialId: string, nodeId: string) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-material", courseId, materialId, nodeId }) }); }
  startAssignment(courseId: string, assignmentId: string, actionRunId?: string, conversation = false, repeatAttemptId?: string) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-assignment", courseId, assignmentId, actionRunId, conversation, ...(repeatAttemptId ? { repeatAttemptId } : {}) }) }); }
  submitAssignment(courseId: string, assignmentId: string, response: AssignmentResponse, idempotencyKey = crypto.randomUUID(), actionRunId?: string, conversation = false, evaluator: "teacher" | "ai" = "teacher", assistantSessionId?: string) { return apiRequest<AssignmentAttemptResult & { status: string; accepted: boolean; evaluatorKind?: string; feedback: AssignmentFeedback }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "submit-assignment", courseId, assignmentId, response, idempotencyKey, actionRunId, conversation, evaluator, ...(assistantSessionId ? { assistantSessionId } : {}) }) }); }
  getAssignmentResult(courseId: string, assignmentId: string, actionRunId?: string, attemptId?: string) {
    const params = new URLSearchParams({ courseId, assignmentId });
    if (actionRunId) params.set("actionRunId", actionRunId);
    if (attemptId) params.set("attemptId", attemptId);
    return apiRequest<{ result: AssignmentResult | null }>(`/api/learning?${params.toString()}`);
  }
  async evaluateAssignment(courseId: string, assignmentId: string, attemptId: string, userId?: string) {
    const response = await apiRequest<AssignmentEvaluationResponse>("/api/learning", { method: "POST", body: JSON.stringify({ action: "evaluate-assignment", courseId, assignmentId, attemptId }), keepalive: true });
    // Refresh durable learner projections in the service boundary, not in a
    // component lifecycle. The request continues even if PracticeObject unmounts.
    if (userId && response.status !== "evaluating") await this.refreshLearnerState(userId).catch(() => undefined);
    return response;
  }
  handoffAssignmentEvaluation(courseId: string, assignmentId: string, attemptId: string) { return apiRequest<{ status: string; attemptId: string; evaluationStatus: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "handoff-assignment-evaluation", courseId, assignmentId, attemptId }) }); }
  listAssignmentSubmissions(courseId?: string) { return apiRequest<{ submissions: AssignmentSubmissionReview[] }>(`/api/learning${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`); }
  listMyPracticeSubmissions() { return apiRequest<{ items: MyPracticeSubmission[] }>("/api/learner?resource=practice-submissions"); }
  acceptAssignment(courseId: string, assignmentId: string, learnerUserId: string, attemptId?: string) { return apiRequest<{ status: "accepted"; accepted: true }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "accept-assignment", courseId, assignmentId, learnerUserId, attemptId }) }); }
  getNavigation(courseId: string) { return apiRequest<NavigationDecision>(`/api/navigation?courseId=${encodeURIComponent(courseId)}`); }
}
