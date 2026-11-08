import { z } from "zod";
import type { AssistantCardRef, AssistantCardType } from "./assistantCards";

export const assistantObjectId = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const ids = z.array(assistantObjectId).min(1).max(20);

/** One Zod directory of server-validated object references. */
export const assistantComponentRefSchemas = {
  route: z.object({ cardType: z.literal("route"), courseId: assistantObjectId }),
  micro: z.object({ cardType: z.literal("micro"), pathId: assistantObjectId, knowledgeId: assistantObjectId, courseId: assistantObjectId.optional() }),
  practice: z.object({ cardType: z.literal("practice"), courseId: assistantObjectId, assignmentId: assistantObjectId, compact: z.boolean().optional() }),
  submission: z.object({ cardType: z.literal("submission"), courseId: assistantObjectId, assignmentId: assistantObjectId }),
  evaluation: z.object({ cardType: z.literal("evaluation"), courseId: assistantObjectId, assignmentId: assistantObjectId, attemptId: z.string().uuid().optional() }),
  course_chapter: z.object({ cardType: z.literal("course_chapter"), courseId: assistantObjectId, chapterId: assistantObjectId }),
  knowledge: z.object({ cardType: z.literal("knowledge"), nodeId: assistantObjectId }),
  mini_map: z.object({ cardType: z.literal("mini_map"), nodeId: assistantObjectId }),
  progress: z.object({ cardType: z.literal("progress"), courseIds: ids }),
  material: z.object({ cardType: z.literal("material"), courseId: assistantObjectId, materialId: assistantObjectId, segmentId: assistantObjectId.optional() }),
  course_match: z.object({ cardType: z.literal("course_match"), courseIds: ids, targetKnowledgeIds: ids, goalText: z.string().trim().min(1).max(400) }),
  brief: z.object({ cardType: z.literal("brief"), messageId: assistantObjectId })
} as const;

/** Server-generated display props. The model never supplies these fields. */
export const assistantCardDisplaySchema = z.object({
  title: z.string().trim().min(1).max(240),
  kicker: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2_000).optional(),
  meta: z.array(z.string().trim().max(240)).max(6).optional(),
  status: z.object({ label: z.string().trim().min(1).max(40), tone: z.enum(["ok", "warn", "brand", "quiet"]) }).optional(),
  steps: z.array(z.object({ id: z.string(), title: z.string(), meta: z.string().optional(), state: z.enum(["done", "now", "quiet"]) })).max(12).optional(),
  items: z.array(z.object({ id: z.string(), title: z.string(), meta: z.string().optional(), state: z.enum(["done", "now", "quiet"]).optional() })).max(8).optional(),
  percent: z.number().min(0).max(100).optional(),
  actionLabel: z.string().trim().max(40).optional(),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("micro"), pathId: z.string(), knowledgeId: z.string(), courseId: z.string().optional(), label: z.string() }),
    z.object({ kind: z.literal("practice"), courseId: z.string(), assignmentId: z.string(), label: z.string() }),
    z.object({ kind: z.literal("course"), courseId: z.string(), label: z.string() })
  ]).optional()
}).strict();

export type CatalogComponent = {
  id: "assignment" | "submission_form" | "evaluation" | "progress" | "route" | "chapter" | "knowledge" | "mini_map" | "material" | "micro" | "course_match" | "brief";
  cardType: AssistantCardType;
  /** Existing management panel this object opens; never a new panel. */
  panel: "assignment" | "route" | "reader" | "records" | "my" | "map";
  ref: z.ZodType<AssistantCardRef>;
  /** Directory text for the model: what the component is and when it helps. */
  label: string;
  purpose: string;
  when: string;
  /** False for legacy/system-produced components the model must not nominate. */
  nominatable?: boolean;
};

/**
 * The render-layer directory shared by the server nomination tool and the React
 * cards. Replacing the renderer later (for example OpenUI) changes this layer
 * and the React registry, not tools, panels or product data.
 */
export const assistantComponentCatalog: CatalogComponent[] = [
  {
    id: "assignment", cardType: "practice", panel: "assignment", ref: assistantComponentRefSchemas.practice as z.ZodType<AssistantCardRef>,
    label: "动手任务卡", purpose: "课程里的一项动手任务：要求、状态和入口。", when: "学习者问某次动手任务要交什么、做到哪了，或当前下一步是一项任务。"
  },
  {
    id: "submission_form", cardType: "submission", panel: "assignment", ref: assistantComponentRefSchemas.submission as z.ZodType<AssistantCardRef>,
    label: "提交表单卡", purpose: "一项动手任务的提交入口。", when: "学习者明确要填写备注、附文件或链接并提交这项任务。"
  },
  {
    id: "evaluation", cardType: "evaluation", panel: "assignment", ref: assistantComponentRefSchemas.evaluation as z.ZodType<AssistantCardRef>,
    label: "动手任务评价卡", purpose: "一次提交的评价结果和逐条反馈。", when: "学习者问某次提交的评价、哪条标准没过，或查看结果。"
  },
  {
    id: "progress", cardType: "progress", panel: "records", ref: assistantComponentRefSchemas.progress as z.ZodType<AssistantCardRef>,
    label: "学习进度卡", purpose: "正在学的课程和已学要点数量。", when: "学习者问自己学到哪了、整体进度如何。"
  },
  {
    id: "route", cardType: "route", panel: "route", ref: assistantComponentRefSchemas.route as z.ZodType<AssistantCardRef>,
    label: "课程路线卡", purpose: "一门课程从当前步骤开始的起步路线。", when: "学习者问从哪开始、接下来按什么顺序学，或想继续一门课程。"
  },
  {
    id: "chapter", cardType: "course_chapter", panel: "route", ref: assistantComponentRefSchemas.course_chapter as z.ZodType<AssistantCardRef>,
    label: "课程章节卡", purpose: "课程里一章的范围和已学情况。", when: "学习者问某一章讲什么、这一章学到哪了。"
  },
  {
    id: "knowledge", cardType: "knowledge", panel: "map", ref: assistantComponentRefSchemas.knowledge as z.ZodType<AssistantCardRef>,
    label: "知识点卡", purpose: "一个知识节点是什么、我学到哪了；点开在右侧档案详情里查看。", when: "学习者问一个概念或要点的含义、自己的掌握状态。它不是小练习，不会开始练习。"
  },
  {
    id: "mini_map", cardType: "mini_map", panel: "map", ref: assistantComponentRefSchemas.mini_map as z.ZodType<AssistantCardRef>,
    label: "小地图卡", purpose: "一个知识点周围真实存在的前置、使能、相关关系。", when: "学习者问几个知识点怎么连、先学什么、和什么有关。它画关系，不解释单个知识点。"
  },
  {
    id: "material", cardType: "material", panel: "reader", ref: assistantComponentRefSchemas.material as z.ZodType<AssistantCardRef>,
    label: "资料卡", purpose: "课程里的一段学习资料；点开阅读器并定位到片段。", when: "学习者问有没有讲某个主题的资料，或想读某段材料。"
  },
  {
    id: "micro", cardType: "micro", panel: "route", ref: assistantComponentRefSchemas.micro as z.ZodType<AssistantCardRef>,
    label: "小练习卡", purpose: "课程里的互动小练习，几分钟，边学边答，可就地做。", when: "学习者想做个小练习、练一下某个要点，或想继续没做完的小练习。不是动手任务。"
  },
  {
    id: "course_match", cardType: "course_match", panel: "route", ref: assistantComponentRefSchemas.course_match as z.ZodType<AssistantCardRef>,
    label: "课程匹配卡", purpose: "目标规划返回的真实课程匹配和覆盖情况。", when: "学习者说出学习目标、想知道哪些现有课程适合，并且本轮已经调用 planLearningGoal。"
  },
  {
    id: "brief", cardType: "brief", panel: "route", ref: assistantComponentRefSchemas.brief as z.ZodType<AssistantCardRef>, nominatable: false,
    label: "课程创建简报卡", purpose: "课程创建流程的系统结果。", when: "由课程创建流程产生，模型不自行提名。"
  }
];

export function catalogComponentFor(cardType: AssistantCardType) {
  return assistantComponentCatalog.find((component) => component.cardType === cardType);
}

/** A model-facing directory generated from the same Zod components the UI uses. */
export function cardCatalogPrompt() {
  return [
    "CARD COMPONENTS (the product's actual component directory; you decide whether any card helps):",
    ...assistantComponentCatalog.filter((component) => component.nominatable !== false).map((component) =>
      `- ${component.cardType} (${component.label}): ${component.purpose} Use when: ${component.when}`
    ),
    "Zero cards is a normal answer. Plain explanations, small talk, meta questions such as '你能做什么', and cases where no real object was found should have no card. Never invent a card type, object ID, title, duration, percentage or progress number.",
    "A knowledge card describes one point and the learner's state; a mini-map card draws how several points connect. Choose between them from the conversation, not from a fixed question-type table.",
    "Before nominating an object, find it with a read tool in this turn (searchKnowledge/getKnowledge/searchMicro/getCourseContext/searchMaterials/getMaterialContext/getNavigationDecision/getLearnerState/getAssignmentContext, etc.) or use an identity already in the explicit context. Every card must reference a real, visible object. When choosing a 小练习, prefer the current Course; without a Course context choose one the learner can see.",
    "If the learner wants to practice, nominate a real 小练习 card; never write your own quiz and never call it a 动手任务. Model-written practice questions are explanation aids, stay in prose, and never count as a learning record.",
    "Put displayCard at the exact point in the reply where the card belongs, and do not repeat its numbers in prose."
  ].join("\n");
}
