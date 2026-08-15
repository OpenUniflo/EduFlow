export type WorkflowAssessmentContext = { courseId: string; assignmentId: string; workflowTemplateId: string };
export type WorkflowAssessmentResult = {
  score: number;
  statusLabel: string;
  stages: string[];
  passed: string[];
  improvements: string[];
  feedback: string;
  reinforcementNodeIds: string[];
};

export interface WorkflowAssessmentProvider {
  resolve(context: WorkflowAssessmentContext | null): WorkflowAssessmentResult | null;
}
