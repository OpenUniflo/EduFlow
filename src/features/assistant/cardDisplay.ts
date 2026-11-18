import type { AssistantCardDisplay, AssistantCardRef, AssistantCardStatus } from "./assistantCards.js";
import { assignmentActionLabel, assignmentStatusPresentation } from "../../shared/learning/assignmentPresentation.js";
import {
  knowledgeScopeLabelFor,
  knowledgeStateLabelFor,
  knowledgeStateTone,
  type KnowledgeState
} from "../../shared/learning/knowledgePresentation.js";
import type { FirstSegment } from "../../shared/learning/firstSegment.js";

/**
 * The single card-display projection used by the server when a card streams and
 * by the browser after a refresh. Both sides only supply the same plain source
 * data; all labels, kickers, status words, step lists and action labels are
 * produced here. Nothing in this module reads React, application services or a
 * database, so the live answer and a reloaded conversation cannot drift.
 */

export type MicroCardSource = {
  title: string;
  description?: string;
  estimatedMinutes: number;
  totalSteps: number;
  completedCount: number;
  progressStatus: "not_started" | "in_progress" | "completed";
  courseTitle?: string;
  steps: ReadonlyArray<{ id: string; title: string; done: boolean }>;
};

export function microCardDisplay(card: Extract<AssistantCardRef, { cardType: "micro" }>, source: MicroCardSource): AssistantCardDisplay {
  const total = source.totalSteps;
  const completed = source.progressStatus === "completed" ? total : Math.min(source.completedCount, total);
  const status: AssistantCardStatus = source.progressStatus === "completed"
    ? { label: "已完成", tone: "ok" }
    : source.progressStatus === "in_progress"
      ? { label: "进行中", tone: "brand" }
      : { label: "未开始", tone: "quiet" };
  return {
    title: source.title,
    kicker: "小练习",
    ...(source.description ? { description: source.description } : {}),
    meta: [
      `约 ${source.estimatedMinutes} 分钟`,
      `${completed} / ${total} 步`,
      ...(source.courseTitle ? [source.courseTitle] : [])
    ],
    status,
    percent: total ? Math.round(completed / total * 100) : 0,
    steps: source.steps.map((step) => ({
      id: step.id,
      title: step.title,
      state: step.done ? "done" as const : "quiet" as const
    })),
    actionLabel: source.progressStatus === "completed" ? "再看一遍" : source.progressStatus === "in_progress" ? "继续" : "开始"
  };
}

export type RouteCardSource = {
  courseId: string;
  courseTitle: string;
  segment: FirstSegment;
};

export function routeCardDisplay(source: RouteCardSource): AssistantCardDisplay {
  const segment = source.segment;
  const steps = segment.steps;
  const current = segment.currentStep;
  const action: NonNullable<AssistantCardDisplay["action"]> = current?.kind === "micro"
    ? { kind: "micro", pathId: current.pathId, knowledgeId: current.nodeId, courseId: source.courseId, label: "开始当前这一步" }
    : current?.kind === "practice"
      ? { kind: "practice", courseId: source.courseId, assignmentId: current.assignmentId, label: "打开动手任务" }
      : { kind: "course", courseId: source.courseId, label: "查看完整路线" };
  const microCount = steps.filter((step) => step.kind === "micro").length;
  const practiceCount = steps.filter((step) => step.kind === "practice").length;
  const status: AssistantCardStatus = segment.complete
    ? { label: "已完成", tone: "ok" }
    : segment.started
      ? { label: "进行中", tone: "brand" }
      : { label: "未开始", tone: "quiet" };
  return {
    title: source.courseTitle,
    kicker: "课程路线",
    description: segment.complete
      ? "这一段已经完成。"
      : `${microCount} 个小练习${practiceCount ? ` + ${practiceCount} 个动手任务` : ""}${segment.totalMinutes ? `，约 ${segment.totalMinutes} 分钟` : ""}。`,
    meta: [
      `${segment.completedCount} / ${steps.length} 步`,
      segment.boundaryNodeId ? "到第一个动手任务" : "整门课程"
    ],
    status,
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      state: step.status === "done" ? "done" as const : step.status === "now" ? "now" as const : "quiet" as const,
      meta: step.kind === "practice"
        ? `动手任务${step.minutes ? ` · 约 ${step.minutes} 分钟` : ""}`
        : `小练习${step.minutes ? ` · 约 ${step.minutes} 分钟` : ""}`
    })),
    action
  };
}

export type AssignmentCardSource = {
  title: string;
  description?: string;
  estimatedMinutes?: number;
  knowledgeCount: number;
  status?: string;
  evaluation?: { status?: string; evaluator?: string; outcome?: string } | null;
};

export function practiceCardDisplay(
  kind: "practice" | "submission",
  source: AssignmentCardSource
): AssistantCardDisplay {
  const presentation = assignmentStatusPresentation(source.status, source.evaluation);
  return {
    title: source.title,
    kicker: kind === "submission" ? "提交表单" : "动手任务",
    ...(source.description ? { description: source.description } : {}),
    meta: [source.estimatedMinutes == null ? "动手做一次" : `约 ${source.estimatedMinutes} 分钟`, `${source.knowledgeCount} 个知识点`],
    status: { label: presentation.label, tone: presentation.tone },
    actionLabel: kind === "submission" ? "打开提交表单" : assignmentActionLabel(source.status, source.evaluation)
  };
}

export type EvaluationCardSource = {
  assignmentTitle: string;
  attemptNumber?: number;
  outcome: "passed" | "failed" | "pending";
  feedbackMessage?: string;
  criteriaPassed: number;
  criteriaTotal: number;
};

export function evaluationCardDisplay(source: EvaluationCardSource): AssistantCardDisplay {
  return {
    title: source.assignmentTitle,
    kicker: "动手任务评价",
    ...(source.feedbackMessage ? { description: source.feedbackMessage } : {}),
    meta: [
      source.attemptNumber ? `第 ${source.attemptNumber} 次提交` : "这次提交",
      source.criteriaTotal ? `${source.criteriaPassed} / ${source.criteriaTotal} 条标准通过` : "等待逐条评价"
    ],
    status: source.outcome === "passed"
      ? { label: "已通过", tone: "ok" }
      : source.outcome === "failed"
        ? { label: "需要修改", tone: "warn" }
        : { label: "评价中", tone: "quiet" },
    actionLabel: "查看评价"
  };
}

export type ChapterCardSource = {
  title: string;
  order: number;
  outcome?: string;
  nodeCount: number;
  learnedCount: number;
};

export function chapterCardDisplay(source: ChapterCardSource): AssistantCardDisplay {
  const done = source.learnedCount;
  const total = source.nodeCount;
  return {
    title: source.title,
    kicker: `第 ${source.order} 章`,
    ...(source.outcome ? { description: source.outcome } : {}),
    meta: [`${total} 个知识点`, `${done} 个已学`],
    status: done >= total && total ? { label: "已学完", tone: "ok" } : done ? { label: "在学", tone: "brand" } : { label: "未开始", tone: "quiet" },
    percent: total ? Math.round(done / total * 100) : 0,
    actionLabel: "打开这一章"
  };
}

export type CourseMatchSource = {
  goalText: string;
  targetKnowledgeIds: readonly string[];
  targetTitles: readonly string[];
  courses: ReadonlyArray<{
    id: string;
    title: string;
    coveredNodeIds: ReadonlySet<string>;
    microNodeIds: ReadonlySet<string>;
  }>;
};

export function courseMatchCardDisplay(card: Extract<AssistantCardRef, { cardType: "course_match" }>, source: CourseMatchSource): AssistantCardDisplay {
  const targets = new Set(source.targetKnowledgeIds);
  const items = source.courses.flatMap((course) => {
    const covered = new Set([...targets].filter((id) => course.coveredNodeIds.has(id)));
    const microCount = [...targets].filter((id) => course.microNodeIds.has(id)).length;
    return [{
      id: course.id,
      title: course.title,
      meta: `${microCount ? `可立刻开始 · ${microCount} 个真实小练习 · ` : "暂不能立刻开始 · "}目标覆盖 ${targets.size ? Math.round(covered.size / targets.size * 100) : 0}%`,
      state: microCount ? "now" as const : "quiet" as const,
      microCount,
      matched: covered.size
    }];
  });
  items.sort((left, right) => Number(right.microCount > 0) - Number(left.microCount > 0) || right.microCount - left.microCount || right.matched - left.matched || left.title.localeCompare(right.title));
  return {
    title: "课程匹配",
    kicker: items.some((item) => item.microCount > 0) ? "可以马上开始的课程" : "课程匹配",
    description: source.targetTitles.length ? `目标知识点：${source.targetTitles.join("、")}` : source.goalText,
    items: items.map(({ microCount: _microCount, matched: _matched, ...item }) => item),
    actionLabel: "查看课程"
  };
}

export type KnowledgeCardSource = {
  title: string;
  description?: string;
  scope?: string;
  status?: string;
};

export function knowledgeCardDisplay(source: KnowledgeCardSource): AssistantCardDisplay {
  const status = (source.status ?? "explore") as KnowledgeState;
  return {
    title: source.title,
    kicker: "知识点",
    ...(source.description ? { description: source.description } : {}),
    meta: [knowledgeScopeLabelFor(source.scope)],
    status: { label: knowledgeStateLabelFor(source.status), tone: knowledgeStateTone(status) },
    actionLabel: "查看知识点"
  };
}

export function miniMapCardDisplay(source: { title: string; edgeCount: number }): AssistantCardDisplay {
  return {
    title: source.title,
    kicker: "小地图",
    description: "这张图只画这个知识点周围真实存在的关系。",
    meta: [`${source.edgeCount} 条关系`],
    actionLabel: "查看知识点"
  };
}

export type ProgressCardSource = {
  courses: ReadonlyArray<{ id: string; title: string; nodeIds: readonly string[]; learnedNodeIds: ReadonlySet<string> }>;
};

export function progressCardDisplay(source: ProgressCardSource): AssistantCardDisplay | null {
  const items = source.courses.flatMap((course) => {
    const done = course.nodeIds.filter((id) => course.learnedNodeIds.has(id)).length;
    return [{
      id: course.id,
      title: course.title,
      meta: `${done} / ${course.nodeIds.length} 个知识点已学`,
      state: done >= course.nodeIds.length && course.nodeIds.length ? "done" as const : done ? "now" as const : "quiet" as const
    }];
  });
  if (!items.length) return null;
  return { title: "学习进度", kicker: "我的课程", items, actionLabel: "继续学习" };
}

export type MaterialCardSource = {
  title: string;
  description?: string;
  segmentSection?: string;
  segmentTitle?: string;
  page?: number;
};

export function materialCardDisplay(source: MaterialCardSource): AssistantCardDisplay {
  const segment = [source.segmentSection, source.segmentTitle].filter(Boolean).join(" · ");
  return {
    title: source.title,
    kicker: "资料片段",
    ...(segment || source.description ? { description: segment || source.description } : {}),
    meta: [source.page == null ? "学习资料" : `第 ${source.page} 页`],
    actionLabel: "查看资料"
  };
}
