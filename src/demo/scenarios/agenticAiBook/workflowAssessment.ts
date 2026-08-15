import type { WorkflowAssessmentProvider } from "@/features/workflow/workflowAssessment";

export const demoWorkflowAssessmentProvider: WorkflowAssessmentProvider = {
  resolve(context) {
    if (context?.courseId !== "agentic-ai-golden" || context.assignmentId !== "golden-chapter-assignment-6" || context.workflowTemplateId !== "multi-agent-workflow") return null;
    return {
      score:86,
      statusLabel:"需要修改",
      stages:["Analyzing workflow...","Checking dependencies...","Inspecting runtime trace...","Evaluating failure recovery..."],
      passed:["Agent Team","Context Isolation","Parallel Execution","Message Protocol"],
      improvements:["Result Verification","Failure Recovery / Termination"],
      feedback:"Candidate 不能直接 Cancel Remaining Workers。应先经过 Verifier → Verified Success → Atomic Settle，再取消剩余 Worker。该反馈不会自动把 Knowledge 标为 mastered。",
      reinforcementNodeIds:["WF03","E13","RT14"]
    };
  }
};
