import type { JsonValue, WorkflowNodeV2, WorkflowStepV2 } from "./types";

/**
 * Pure presentation facts for the canvas run bubble, the run-data panel and the
 * history drawer. Nothing here reads editor state or the API, so every rule can
 * be tested without a browser.
 */

export type RunTone = "ok" | "empty" | "failed" | "running" | "cancelled" | "waiting";

export type RunValueKind = "text" | "number" | "boolean" | "list" | "object" | "empty";

export type RunValueView = {
  kind: RunValueKind;
  /** Chinese type label: 文本 / 数字 / 列表 / 对象. */
  label: string;
  /** Short one-line preview for a compact row. */
  preview: string;
  /** List length, used by the expandable `N 条` row. */
  count?: number;
  /** Object key count, used by the collapsible `N 个字段` row. */
  fieldCount?: number;
  /** Rows can be opened when this is a list or an object. */
  expandable: boolean;
};

export type RunFieldRow = {
  name: string;
  value: JsonValue | undefined;
  view: RunValueView;
};

export type RunBubbleSummary = {
  tone: RunTone;
  text: string;
};

export type RunInputLike = {
  inputReuse?: { fields?: { pointer: string; value: JsonValue }[] };
  launchContext?: { workflowInput?: JsonValue } | null;
};

export type RunTimingLike = {
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};

const objectValue = (value: JsonValue | undefined): Record<string, JsonValue> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;

function trimText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One compact duration for a bubble, run-data header or history row. */
export function formatRunDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(Math.round(ms / 100) / 10).toFixed(1).replace(/\.0$/, "")}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** Elapsed time of a step; Worker error timing is the last fallback. */
export function runStepDuration(step: Pick<WorkflowStepV2, "startedAt" | "finishedAt" | "error"> | undefined): number | undefined {
  if (!step) return undefined;
  if (step.startedAt && step.finishedAt) {
    const started = Date.parse(step.startedAt);
    const finished = Date.parse(step.finishedAt);
    if (Number.isFinite(started) && Number.isFinite(finished) && finished >= started) return finished - started;
  }
  const fallback = step.error?.elapsedMs;
  return typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 0 ? fallback : undefined;
}

export function runElapsed(step: RunTimingLike | null | undefined): number | undefined {
  if (!step?.startedAt || !step.finishedAt) return undefined;
  const started = Date.parse(step.startedAt);
  const finished = Date.parse(step.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return undefined;
  return finished - started;
}

function textOf(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.map(item => textOf(item)).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(" ") : undefined;
  }
  const object = objectValue(value);
  if (!object) return undefined;
  for (const key of ["text", "answer", "content", "message", "summary"]) {
    const text = textOf(object[key]);
    if (text) return text;
  }
  if (Array.isArray(object.messages)) {
    for (const message of [...object.messages].reverse()) {
      const entry = objectValue(message);
      if (entry?.role !== "assistant") continue;
      const text = textOf(entry.content);
      if (text) return text;
    }
  }
  return undefined;
}

function textLength(value: string): number {
  return Array.from(value.replace(/\s+/g, "")).length;
}

/** Finds the first array named `hits` inside a bounded tool result. */
export function searchHitCount(value: JsonValue | undefined, depth = 0): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return undefined;
  const object = value as Record<string, JsonValue>;
  if (Array.isArray(object.hits)) return object.hits.length;
  for (const key of ["result", "output", "response", "data"]) {
    const nested = object[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const found = searchHitCount(nested, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

const INTERNAL_KEYS = new Set(["id", "runId", "stepId", "messageId", "toolCallId", "toolCallIds", "checkpointId", "taskId", "threadId", "namespace", "graphPath"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Internal execution identities stay out of the value previews. */
export function internalValueKey(key: string): boolean {
  return INTERNAL_KEYS.has(key) || /(?:Id|_id)$/.test(key) || /^(?:lc_|run[-_:]|step[-_:]|thread[-_:]|task[-_:])/i.test(key);
}

/** A string that is only an internal identifier (UUID, LangChain run id, …). */
export function internalIdentifierValue(value: JsonValue | undefined): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return UUID.test(text) || /^lc_[a-z]+--/i.test(text) || /^(?:run|step|thread|task|checkpoint)[-_:][0-9a-f-]{16,}$/i.test(text);
}

/** Chinese type label and a bounded preview; raw JSON is never displayed. */
export function runValueView(value: JsonValue | undefined): RunValueView {
  if (value === undefined) return { kind: "empty", label: "无记录", preview: "尚无记录", expandable: false };
  if (value === null) return { kind: "empty", label: "空值", preview: "空值", expandable: false };
  if (typeof value === "string") {
    return { kind: "text", label: "文本", preview: value.trim() ? value : "空文本", expandable: false };
  }
  if (typeof value === "number") return { kind: "number", label: "数字", preview: String(value), expandable: false };
  if (typeof value === "boolean") return { kind: "boolean", label: "是/否", preview: value ? "是" : "否", expandable: false };
  if (Array.isArray(value)) {
    const count = value.length;
    return { kind: "list", label: "列表", preview: `${count} 条`, count, expandable: count > 0 };
  }
  const object = objectValue(value)!;
  const keys = Object.keys(object);
  return { kind: "object", label: "对象", preview: `${keys.length} 个字段`, fieldCount: keys.length, expandable: keys.length > 0 };
}

/** Rows for a value section; objects become one row per field and scalars one named row. */
export function runFieldRows(value: JsonValue | undefined, scalarName = "值"): RunFieldRow[] {
  const object = objectValue(value);
  if (!object) return [{ name: scalarName, value, view: runValueView(value) }];
  return Object.entries(object)
    .filter(([name, entry]) => !internalValueKey(name) && !internalIdentifierValue(entry))
    .map(([name, entry]) => ({ name, value: entry, view: runValueView(entry) }));
}

function routerLabel(node: WorkflowNodeV2, output: JsonValue | undefined): string | undefined {
  const object = objectValue(output);
  const raw = object?.outlet;
  const outlet = Array.isArray(raw) ? raw.find(item => typeof item === "string") : raw;
  if (typeof outlet !== "string" || !outlet) return undefined;
  const cases = Array.isArray(node.config.cases) ? node.config.cases : [];
  for (const item of cases) {
    const entry = objectValue(item);
    if (entry?.id === outlet) {
      return typeof entry.label === "string" && entry.label.trim() ? entry.label : outlet;
    }
  }
  if (outlet === node.config.defaultOutlet) {
    return typeof node.config.defaultLabel === "string" && node.config.defaultLabel.trim()
      ? node.config.defaultLabel
      : "其他";
  }
  return outlet;
}

function countSummary(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return `得到 ${value.length} 项`;
  const object = objectValue(value);
  if (object) {
    const keys = Object.keys(object);
    return keys.length ? `得到 ${keys.length} 个字段` : "没有返回内容";
  }
  const text = textOf(value);
  if (text) return `返回 ${textLength(text)} 字`;
  return "执行完成";
}

/**
 * One sentence for the collapsed bubble. Search results drive the amber zero
 * state, model text uses a character count, and a router names its chosen branch.
 */
export function summarizeNodeRun(
  node: WorkflowNodeV2 | undefined,
  step: Pick<WorkflowStepV2, "status" | "output" | "error"> | undefined,
  options: { errorMessage?: string } = {},
): RunBubbleSummary {
  if (!step) return { tone: "ok", text: "尚无运行结果" };
  if (step.status === "failed" || step.status === "interrupted") {
    return { tone: "failed", text: options.errorMessage?.trim() || "运行失败，请查看详情" };
  }
  if (step.status === "cancelled") return { tone: "cancelled", text: "运行已取消" };
  if (step.status === "waiting") return { tone: "waiting", text: "等待回应" };
  if (step.status === "running" || step.status === "queued") return { tone: "running", text: "执行中…" };

  const output = step.output;
  const hits = searchHitCount(output);
  if (hits !== undefined) {
    return hits === 0
      ? { tone: "empty", text: "搜索没有结果 · 0 条" }
      : { tone: "ok", text: `搜到 ${hits} 条` };
  }
  if (node?.type === "core.llm") {
    const text = textOf(output);
    if (!text || !text.trim()) return { tone: "ok", text: "模型没有返回文本" };
    return { tone: "ok", text: `回答 ${textLength(text)} 字` };
  }
  if (node?.type === "core.router") {
    const label = routerLabel(node, output);
    return { tone: "ok", text: label ? `判断为：${label}` : "已完成判断" };
  }
  return { tone: "ok", text: countSummary(output) };
}

/** Relative time used by the history drawer and the history banner. */
export function relativeRunTime(value: string | undefined, now: number = Date.now()): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const delta = Math.max(0, now - time);
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  if (delta < 172_800_000) return "昨天";
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)} 天前`;
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** The question that identifies a run in history, clipped to 20 characters. */
export function runInputSummary(run: RunInputLike | null | undefined, max = 20): string {
  if (!run) return "未填写输入";
  const fields = run.inputReuse?.fields ?? [];
  const preferred = fields.find(field => /\/question$/.test(field.pointer));
  const fallback = fields.find(field => typeof field.value === "string" && field.value.trim());
  const value = preferred?.value ?? fallback?.value ?? run.launchContext?.workflowInput;
  const text = typeof value === "string" ? value : textOf(value);
  if (!text || !text.trim()) return "未填写输入";
  return trimText(text, max);
}

export function runEnvironmentLabel(run: { variableEnvironment?: string | null } | null | undefined): string {
  return run?.variableEnvironment?.trim() || "默认";
}

export function runStatusTone(status: string | undefined): RunTone {
  if (status === "failed" || status === "interrupted") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "waiting") return "waiting";
  if (status === "running" || status === "queued") return "running";
  return "ok";
}
