import type { UserKnowledgeRecord } from "./types";

export const demoUserKnowledge: UserKnowledgeRecord[] = [
  { nodeId: "PY01", status: "mastered", mastery: 100, updatedAt: "2026-06-01T08:00:00.000Z" },
  { nodeId: "PY06", status: "mastered", mastery: 100, updatedAt: "2026-06-03T08:00:00.000Z" },
  { nodeId: "PY08", status: "mastered", mastery: 94, updatedAt: "2026-06-05T08:00:00.000Z" },
  { nodeId: "PY18", status: "mastered", mastery: 92, updatedAt: "2026-06-08T08:00:00.000Z" },
  { nodeId: "PY34", status: "mastered", mastery: 88, updatedAt: "2026-06-10T08:00:00.000Z" },
  { nodeId: "PY45", status: "mastered", mastery: 91, updatedAt: "2026-06-13T08:00:00.000Z" },
  { nodeId: "PY46", status: "mastered", mastery: 90, updatedAt: "2026-06-16T08:00:00.000Z" },
  { nodeId: "PY53", status: "mastered", mastery: 82, updatedAt: "2026-06-19T08:00:00.000Z" },
  { nodeId: "PY56", status: "mastered", mastery: 86, updatedAt: "2026-06-22T08:00:00.000Z" },
  { nodeId: "PY57", status: "mastered", mastery: 84, updatedAt: "2026-06-25T08:00:00.000Z" },
  { nodeId: "PY58", status: "mastered", mastery: 80, updatedAt: "2026-06-28T08:00:00.000Z" },
  { nodeId: "PY61", status: "learning", mastery: 46, updatedAt: "2026-07-20T08:00:00.000Z" },
  { nodeId: "PY62", status: "learning", mastery: 34, updatedAt: "2026-07-24T08:00:00.000Z" },
  { nodeId: "H01", status: "mastered", mastery: 100, updatedAt: "2026-07-01T08:00:00.000Z", evidence: [{ type: "course", label: "Agentic AI · 第 1 课", refId: "agentic-ai" }] },
  { nodeId: "P01", status: "mastered", mastery: 100, updatedAt: "2026-07-03T08:00:00.000Z", evidence: [{ type: "course", label: "Agentic AI · 第 2 课", refId: "agentic-ai" }] },
  { nodeId: "P05", status: "mastered", mastery: 100, updatedAt: "2026-07-05T08:00:00.000Z", evidence: [{ type: "course", label: "Agentic AI · 第 2 课", refId: "agentic-ai" }] },
  { nodeId: "A05", status: "mastered", mastery: 100, updatedAt: "2026-07-08T08:00:00.000Z", evidence: [{ type: "course", label: "Agentic AI · 第 3 课", refId: "agentic-ai" }] },
  { nodeId: "R05", status: "learning", mastery: 55, updatedAt: "2026-07-28T08:00:00.000Z", evidence: [{ type: "course", label: "Agentic AI · 第 4 课", refId: "lesson-04" }] },
  { nodeId: "R02", status: "learning", mastery: 58, updatedAt: "2026-07-30T08:00:00.000Z", evidence: [{ type: "course", label: "Agentic AI · 第 4 课", refId: "lesson-04" }] }
];
