import {
  dateKeyInTimeZone,
  formatShortDayLabel,
  formatTimeInTimeZone,
  formatWeekday,
  formatYearMonth,
  routeSourceLabel,
  type RecordEvent,
  type RecordEventMeta,
  type RecordEventType,
  type RecordStatus
} from "@/shared/learning/records";
import { formatRecordScore } from "@/shared/learning/recordsFeedback";
import type { PillTone } from "@/shared/ui/Pill";

export const RECORD_TYPE_LABELS: Record<RecordEventType, string> = {
  micro: "小练习完成",
  practice: "动手任务提交",
  evaluation: "评价返回",
  route: "路线版本变更"
};

const STATUS_LABELS: Record<Exclude<RecordStatus, "version">, string> = {
  learned: "已学",
  pending: "审核中",
  needs_revision: "需修改",
  passed: "已通过"
};

const STATUS_TONES: Record<Exclude<RecordStatus, "version">, PillTone> = {
  learned: "ok",
  pending: "brand",
  needs_revision: "warn",
  passed: "ok"
};

export function recordStatusLabel(event: RecordEvent): string {
  if (event.type === "route") return event.versionNumber ? `v${event.versionNumber}` : "版本";
  if (event.status === "passed" && event.type === "evaluation") return "通过";
  return event.status === "version" ? "版本" : STATUS_LABELS[event.status];
}

export function recordStatusTone(event: RecordEvent): PillTone {
  if (event.type === "route") return "brand";
  return event.status === "version" ? "brand" : STATUS_TONES[event.status];
}

export function formatRecordDayHeading(dateKey: string): string {
  return `${formatShortDayLabel(dateKey)} · 周${formatWeekday(dateKey)}`;
}

export function formatRecordDateRange(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  const start = formatYearMonth(from);
  const end = formatYearMonth(to);
  return start === end ? start : `${start} – ${end}`;
}

export function formatRecordFullDate(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  return `${parts[0]} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
}

export function formatRecordTimestamp(value: string, timeZone: string): string {
  const date = dateKeyInTimeZone(value, timeZone);
  const time = formatTimeInTimeZone(value, timeZone);
  return date && time ? `${date} ${time}` : "";
}

export function recordScoreText(meta: RecordEventMeta): string {
  if (meta.score === undefined || meta.scoreMax === undefined) return "";
  return formatRecordScore({
    earned: meta.score,
    max: meta.scoreMax,
    convertedFromRatio: Boolean(meta.scoreConverted)
  });
}

export function recordMetaParts(event: RecordEvent): string[] {
  const parts: string[] = [];
  if (event.courseTitle) parts.push(event.courseTitle);
  if (event.meta.chapterNumber) parts.push(`第 ${event.meta.chapterNumber} 章`);
  if (event.meta.attemptNumber) parts.push(`第 ${event.meta.attemptNumber} 次`);
  const score = recordScoreText(event.meta);
  if (score) parts.push(`得分 ${score}`);
  if (event.meta.estimatedMinutes !== undefined) parts.push(`约 ${event.meta.estimatedMinutes} 分钟`);
  if (event.type === "route") {
    const source = routeSourceLabel(event.meta.source);
    if (source) parts.push(source);
    const added = event.meta.addedSteps ?? 0;
    const removed = event.meta.removedSteps ?? 0;
    if (added || removed) {
      const changes = [added ? `+${added} 步` : "", removed ? `−${removed} 步` : ""].filter(Boolean).join(" / ");
      parts.push(changes);
    }
  }
  if (event.type === "evaluation" && event.meta.basisCount) parts.push(`${event.meta.basisCount} 条依据`);
  if (event.type === "micro") parts.push("已学");
  return parts;
}

export function buildRecordsCsv(events: readonly RecordEvent[], timeZone: string, now = new Date()): {
  content: string;
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
} {
  const columns = ["时间", "类型", "标题", "课程", "状态", "章节", "第 N 次", "分数", "版本", "评价依据", "回链"];
  const rows = events.map((event) => {
    const feedback = event.feedback
      ? [
          event.feedback.summary ?? "",
          event.feedback.comment ?? "",
          ...event.feedback.items.map((item) => [item.label, item.value].filter(Boolean).join(" "))
        ].filter(Boolean).join("；")
      : "";
    return [
      formatRecordTimestamp(event.occurredAt, timeZone),
      RECORD_TYPE_LABELS[event.type],
      event.title,
      event.courseTitle ?? "",
      recordStatusLabel(event),
      event.meta.chapterNumber ? `第 ${event.meta.chapterNumber} 章` : "",
      event.meta.attemptNumber ? `第 ${event.meta.attemptNumber} 次` : "",
      recordScoreText(event.meta),
      event.versionNumber ? `v${event.versionNumber}` : "",
      feedback,
      event.links.map((link) => `${link.label} ${link.to}`).join(" | ")
    ];
  });
  const lines = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const date = dateKeyInTimeZone(now.toISOString(), timeZone) || new Date().toISOString().slice(0, 10);
  return {
    content: `\uFEFF${lines}\n`,
    fileName: `eduflow-records-${date}.csv`,
    rowCount: rows.length,
    columnCount: columns.length,
    columns
  };
}

function csvCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function downloadCsvFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
