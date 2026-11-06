export type AssignmentResponse = (
  | { kind: "answer"; text: string }
  | { kind: "code"; code?: string; fileName?: string; attachmentSourceIds?: string[] }
  | { kind: "trace"; selectedStepId: string }
  | { kind: "workflow"; runId: string }) & { attachmentSourceIds?: string[] };

export type PerformanceOutcome = "passed" | "failed" | "pending";

export type AssignmentAttemptResult = {
  attemptId: string;
  resultId: string;
  outcome: PerformanceOutcome;
  duplicate: boolean;
};

export type AssignmentCriterionFeedback = {
  index: number;
  criterion: string;
  passed: boolean;
  validated: boolean;
  reason: string;
  quote: string;
};

/** Server-authored feedback. Learner copy is owned by `code`, never raw evaluator prose. */
export type AssignmentFeedback = {
  code?: string;
  message?: string;
  evaluator?: "ai" | "teacher" | string;
  evaluatorKind?: string;
  model?: string;
  promptVersion?: string;
  requestedEvaluator?: "ai" | "teacher" | string;
  criteria?: AssignmentCriterionFeedback[];
  invalidQuoteCount?: number;
  [key: string]: unknown;
};

export type AssignmentEvaluationInfo = {
  status: "running" | "succeeded" | "failed" | "handed_off" | string;
  errorCode?: string;
  model?: string;
  promptVersion?: string;
  startedAt?: string;
  completedAt?: string;
};

export type AssignmentResult = AssignmentAttemptResult & {
  attemptNumber?: number;
  accepted: boolean;
  feedback: AssignmentFeedback;
  evaluatorKind?: string;
  evaluatedAt: string;
  response: AssignmentResponse;
  attachments?: Array<{ id: string; title: string }>;
  evaluation?: AssignmentEvaluationInfo;
};

export type AssignmentEvaluationResponse = {
  status: "accepted" | "needs_revision" | "evaluating" | "handed_off";
  accepted?: boolean;
  attemptId: string;
  resultId?: string;
  outcome?: PerformanceOutcome;
  feedback?: AssignmentFeedback;
  evaluationStatus?: string;
};
