import { apiRequest } from "@/shared/api/apiClient";

export class ApiLearnerStateService {
  startKnowledge(nodeId: string) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-knowledge", nodeId }) }); }
  startAssignment(courseId: string, assignmentId: string) { return apiRequest<{ status: string }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-assignment", courseId, assignmentId }) }); }
  submitAssignment(courseId: string, assignmentId: string, deterministicAccepted = false) { return apiRequest<{ status: string; accepted: boolean }>("/api/learning", { method: "POST", body: JSON.stringify({ action: "submit-assignment", courseId, assignmentId, deterministicAccepted }) }); }
}
