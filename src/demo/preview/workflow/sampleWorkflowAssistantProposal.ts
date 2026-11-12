import type { AssistantProposalPreview } from "@/features/workflow/editor/v2/assistantProposalPreview";

/**
 * Obviously synthetic N12 assistant proposal. Injected through src/app so the
 * Feature never imports sample data; it is read-only and applies to nothing.
 * The copy is deliberately process-neutral: it is not an analysis of the open
 * Workflow and never claims to know its nodes or selection.
 */
export const sampleWorkflowAssistantProposal: AssistantProposalPreview = {
  title: "示例 · 补充结果整理与失败分支",
  summary: "示例建议：在流程末尾增加一个结果整理步骤，并为失败情况保留一条可读的提示路径。这是一段固定的示例数据，不代表对当前工作流的分析，也不会修改画布。",
  impact: "仅示例预览 · 当前草稿与运行都不会改变",
  changes: [
    { kind: "add", title: "「结果整理」节点", detail: "示例 · 汇总上游结果后输出" },
    { kind: "modify", title: "「完成」前的连接", detail: "示例 · 增加一条失败提示路径" },
    { kind: "delete", title: "未使用的临时连线", detail: "示例 · 由新的整理步骤替代" },
  ],
};
