export type AssignmentResponse =
  | { kind: "answer"; text: string }
  | { kind: "code"; code?: string; fileName?: string }
  | { kind: "trace"; selectedStepId: string }
  | { kind: "workflow"; runId: string };

export type PerformanceOutcome = "passed" | "failed" | "pending";

export type AssignmentAttemptResult = {
  attemptId: string;
  resultId: string;
  outcome: PerformanceOutcome;
  duplicate: boolean;
};
