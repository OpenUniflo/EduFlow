import type { AssistantProposalPreview } from "@/features/workflow/editor/v2/assistantProposalPreview";

/**
 * Obviously synthetic N12 assistant proposal. Injected through src/app so the
 * Feature never imports sample data; it is read-only and applies to nothing.
 */
export const sampleWorkflowAssistantProposal: AssistantProposalPreview = {
  title: "示例 · 补一条失败重试路径",
  summary: "示例建议：观察拿到超时或 5xx 时，回到工具调用重试三次，并把超时放宽到 10 秒。",
  impact: "仅示例预览 · 当前草稿与运行都不会改变",
  changes: [
    { kind: "add", title: "「错误重试」节点", detail: "示例 · 最多 3 次 · 指数退避 2s" },
    { kind: "modify", title: "「搜索 Hacker News」超时", detail: "示例 · 5s → 10s" },
    { kind: "delete", title: "旧连线「工具调用 → 观察」", detail: "示例 · 由重试节点替代" },
  ],
};
