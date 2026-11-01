import { describe, expect, it } from "vitest";
import type { RecordEvent } from "@/shared/learning/records";
import {
  buildRecordsCsv,
  formatRecordDateRange,
  recordMetaParts,
  recordStatusLabel,
  recordStatusTone
} from "./recordsFormat";

function event(overrides: Partial<RecordEvent> = {}): RecordEvent {
  return {
    id: "e1",
    type: "evaluation",
    occurredAt: "2026-11-02T01:05:00.000Z",
    title: "天气, 查询 \"Agent\"",
    courseId: "c1",
    courseTitle: "AI Agent 开发基础",
    status: "needs_revision",
    meta: { chapterNumber: 2, attemptNumber: 3, score: 94, scoreMax: 100, basisCount: 2 },
    feedback: { summary: "需修改，请根据评语调整后重新提交", comment: "错误处理路径不完整", items: [{ label: "功能", value: "20 / 40" }] },
    links: [
      { kind: "practice", label: "查看评价", to: "/courses/c1/assignments/a1" },
      { kind: "conversation", label: "回到对话", to: "/?practice=c1%3Aa1" }
    ],
    ...overrides
  };
}

describe("records formatting", () => {
  it("formats status labels and tones without inventing a state", () => {
    expect(recordStatusLabel(event())).toBe("需修改");
    expect(recordStatusTone(event())).toBe("warn");
    expect(recordStatusLabel(event({ type: "practice", status: "passed" }))).toBe("已通过");
    expect(recordStatusLabel(event({ type: "evaluation", status: "passed" }))).toBe("通过");
    expect(recordStatusLabel(event({ type: "micro", status: "learned" }))).toBe("已学习");
    expect(recordStatusLabel(event({ type: "route", status: "version", versionNumber: 4 }))).toBe("v4");
    expect(recordStatusTone(event({ type: "route", status: "version" }))).toBe("brand");
  });

  it("builds only real metadata fields and a compact date span", () => {
    expect(recordMetaParts(event())).toEqual(["AI Agent 开发基础", "第 2 章", "第 3 次", "得分 94 / 100", "2 条依据"]);
    expect(recordMetaParts(event({ type: "route", status: "version", meta: { source: "adjustment", addedSteps: 2, removedSteps: 1 } }))).toEqual(["AI Agent 开发基础", "调整路线", "+2 步 / −1 步"]);
    expect(recordMetaParts(event({ type: "micro", status: "learned", meta: { estimatedMinutes: 6 } }))).toEqual(["AI Agent 开发基础", "约 6 分钟", "已学习"]);
    expect(formatRecordDateRange("2026-09-01", "2026-11-02")).toBe("2026-09 – 2026-11");
    expect(formatRecordDateRange(null, null)).toBe("—");
  });

  it("exports the current filter as UTF-8 CSV with the full column set", () => {
    const csv = buildRecordsCsv([event()], "Asia/Shanghai", new Date("2026-11-02T12:00:00.000Z"));
    expect(csv.fileName).toBe("eduflow-records-2026-11-02.csv");
    expect(csv.columnCount).toBe(11);
    expect(csv.rowCount).toBe(1);
    expect(csv.columns).toEqual(["时间", "类型", "标题", "课程", "状态", "章节", "第 N 次", "分数", "版本", "评价依据", "回链"]);
    expect(csv.content.startsWith("\uFEFF")).toBe(true);
    const lines = csv.content.replace(/^\uFEFF/, "").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split(",")).toHaveLength(11);
    expect(lines[1]).toContain("\"天气, 查询 \"\"Agent\"\"\"");
    expect(lines[1]).toContain("\"2026-11-02 09:05\"");
    expect(lines[1]).toContain("需修改，请根据评语调整后重新提交；错误处理路径不完整；功能 20 / 40");
    expect(lines[1]).not.toContain("needs_revision");
  });
});
