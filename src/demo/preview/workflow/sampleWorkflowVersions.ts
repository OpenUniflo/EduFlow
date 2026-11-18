/**
 * Obviously synthetic version history for the Works card preview. It never
 * claims a real revision number and is injected through src/app.
 */
export const sampleWorkflowVersions = [
  { id: "sample-version-a", label: "示例版本 A", createdAt: "2026-10-20T10:05:00+08:00", summary: "示例 · 初始节点与输入", nodeCount: 3 },
  { id: "sample-version-b", label: "示例版本 B", createdAt: "2026-10-24T18:40:00+08:00", summary: "示例 · 加入分流与重试", nodeCount: 5 },
  { id: "sample-version-c", label: "示例版本 C", createdAt: "2026-10-28T14:27:00+08:00", summary: "示例 · 调整提示词与输出", nodeCount: 6 },
] as const;
