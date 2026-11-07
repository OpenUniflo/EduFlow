/**
 * Timeline card contract.
 *
 * A card part stores only stable object references (`AssistantCardRef`). The
 * server validates the references and returns display data for the live
 * response; after a refresh the same references are re-read from current
 * product state. Card data is never authored by the model.
 */

export const ASSISTANT_MAX_CARDS = 3;

export function cardLimitReached(accepted: number): boolean {
  return accepted >= ASSISTANT_MAX_CARDS;
}

export const assistantCardTypes = [
  "route",
  "micro",
  "practice",
  "evaluation",
  "course_chapter",
  "course_match",
  "brief",
  "knowledge",
  "progress",
  "material",
  "segment_summary"
] as const;

export type AssistantCardType = (typeof assistantCardTypes)[number];

export type AssistantCardRef =
  | { cardType: "route"; courseId: string }
  | { cardType: "micro"; pathId: string; knowledgeId: string; courseId?: string }
  | { cardType: "practice"; courseId: string; assignmentId: string }
  | { cardType: "evaluation"; courseId: string; assignmentId: string; attemptId?: string }
  | { cardType: "course_chapter"; courseId: string; chapterId: string }
  | { cardType: "course_match"; courseIds: string[]; targetKnowledgeIds: string[]; goalText: string }
  | { cardType: "brief"; messageId: string }
  | { cardType: "knowledge"; nodeId: string; pathId?: string; courseId?: string }
  | { cardType: "progress"; courseIds: string[] }
  | { cardType: "material"; courseId: string; materialId: string; segmentId?: string }
  | { cardType: "segment_summary"; courseId: string };

export type AssistantCardStatusTone = "ok" | "warn" | "brand" | "quiet";

export type AssistantCardStatus = { label: string; tone: AssistantCardStatusTone };

export type AssistantCardStep = {
  id: string;
  title: string;
  meta?: string;
  state: "done" | "now" | "quiet";
};

export type AssistantCardItem = {
  id: string;
  title: string;
  meta?: string;
  state?: "done" | "now" | "quiet";
};

/** Server-generated display data. Never persisted; rebuilt from the reference. */
export type AssistantCardAction =
  | { kind: "micro"; pathId: string; knowledgeId: string; courseId?: string; label: string }
  | { kind: "practice"; courseId: string; assignmentId: string; label: string }
  | { kind: "course"; courseId: string; label: string };

export type AssistantCardDisplay = {
  title: string;
  kicker?: string;
  description?: string;
  meta?: string[];
  status?: AssistantCardStatus;
  steps?: AssistantCardStep[];
  items?: AssistantCardItem[];
  percent?: number;
  actionLabel?: string;
  action?: AssistantCardAction;
};

export type AssistantCardOutput = { card: AssistantCardRef; display: AssistantCardDisplay };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function text(value: unknown, max = 600): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function ids(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && idPattern.test(item)))].slice(0, max);
}

/** Parse a persisted reference. Returns null for anything unknown or malformed. */
export function parseAssistantCardRef(value: unknown): AssistantCardRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const one = (key: string) => {
    const candidate = text(source[key], 240);
    return candidate && idPattern.test(candidate) ? candidate : undefined;
  };
  switch (source.cardType) {
    case "route": {
      const courseId = one("courseId");
      return courseId ? { cardType: "route", courseId } : null;
    }
    case "micro": {
      const pathId = one("pathId");
      const knowledgeId = one("knowledgeId");
      if (!pathId || !knowledgeId) return null;
      const courseId = one("courseId");
      return { cardType: "micro", pathId, knowledgeId, ...(courseId ? { courseId } : {}) };
    }
    case "practice": {
      const courseId = one("courseId");
      const assignmentId = one("assignmentId");
      return courseId && assignmentId ? { cardType: "practice", courseId, assignmentId } : null;
    }
    case "evaluation": {
      const courseId = one("courseId");
      const assignmentId = one("assignmentId");
      const attemptId = one("attemptId");
      // Historical cards were written before attempt identities were stored;
      // keep them readable and fall back to the latest Attempt at read time.
      return courseId && assignmentId ? { cardType: "evaluation", courseId, assignmentId, ...(attemptId ? { attemptId } : {}) } : null;
    }
    case "course_chapter": {
      const courseId = one("courseId");
      const chapterId = one("chapterId");
      return courseId && chapterId ? { cardType: "course_chapter", courseId, chapterId } : null;
    }
    case "course_match": {
      const courseIds = ids(source.courseIds, 5);
      const targetKnowledgeIds = ids(source.targetKnowledgeIds, 20);
      const goalText = text(source.goalText, 400);
      return courseIds.length && targetKnowledgeIds.length && goalText
        ? { cardType: "course_match", courseIds, targetKnowledgeIds, goalText }
        : null;
    }
    case "brief": {
      const messageId = one("messageId");
      return messageId ? { cardType: "brief", messageId } : null;
    }
    case "knowledge": {
      const nodeId = one("nodeId");
      const pathId = one("pathId");
      const courseId = one("courseId");
      return nodeId ? { cardType: "knowledge", nodeId, ...(pathId ? { pathId } : {}), ...(courseId ? { courseId } : {}) } : null;
    }
    case "progress": {
      const courseIds = ids(source.courseIds, 8);
      return courseIds.length ? { cardType: "progress", courseIds } : null;
    }
    case "material": {
      const courseId = one("courseId");
      const materialId = one("materialId");
      if (!courseId || !materialId) return null;
      const segmentId = one("segmentId");
      return { cardType: "material", courseId, materialId, ...(segmentId ? { segmentId } : {}) };
    }
    case "segment_summary": {
      const courseId = one("courseId");
      return courseId ? { cardType: "segment_summary", courseId } : null;
    }
    default:
      return null;
  }
}

export function isDisplayCardPartType(type: string): boolean {
  return type === "tool-displayCard" || type === "dynamic-tool";
}

/** The compact one-line description used in model history (never card payloads). */
export function cardHistoryLabel(ref: AssistantCardRef): string {
  switch (ref.cardType) {
    case "route": return "一段起步路线";
    case "micro": return "一个小练习";
    case "practice": return "一个动手任务";
    case "evaluation": return "一条实践评价结果";
    case "course_chapter": return "一个课程章节";
    case "course_match": return "一份课程匹配结果";
    case "brief": return "一份课程创建简报";
    case "knowledge": return "一个知识要点";
    case "progress": return "一份学习进度";
    case "material": return "一段资料";
    case "segment_summary": return "一份第一段小结";
  }
}
