import type { MockSession } from "@/features/auth/types";
import { canManageCourses, canManageKnowledgeDomains } from "@/features/auth/capabilities";
import { knowledgeScopeLabelFor, knowledgeStateLabelFor } from "@/shared/learning/knowledgePresentation";
import type { DomainGovernanceState } from "@/features/knowledge/domain/DomainGovernanceRepository";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord, UserKnowledgeStatus } from "@/features/profile/types";
import { buildArchiveModel, type ArchiveCourse, type ArchiveNode } from "@/features/archive/model/atlasModel";
import { isCourseVisibleToViewer } from "@/features/course/runtime/courseVisibility";
import { chapterDisplayNumber } from "@/shared/learning/chapterNumbering";

export type GlobalSearchPageId = "home" | "archive" | "works" | "records" | "settings" | "teaching" | "admin";
export type GlobalSearchActionId = "new-workflow" | "continue-course" | "open-records" | "open-settings" | "open-assistant";

export type PageSearchItem = {
  id: GlobalSearchPageId;
  title: string;
  path: string;
  keywords: string[];
};

export type CourseSearchItem = {
  id: string;
  title: string;
  meta: string;
  keywords: string[];
  state: ArchiveCourse["state"];
  progress: number;
  updatedAt?: string;
};

export type KnowledgeSearchItem = {
  id: string;
  title: string;
  meta: string;
  keywords: string[];
  status: UserKnowledgeStatus | "explore";
  updatedAt?: string;
};

export type ActionSearchItem = {
  id: GlobalSearchActionId;
  title: string;
  meta: string;
  keywords: string[];
  courseId?: string;
};

export type GlobalSearchData = {
  pages: PageSearchItem[];
  courses: CourseSearchItem[];
  knowledge: KnowledgeSearchItem[];
  actions: ActionSearchItem[];
  currentCourseId?: string;
};

export type RankedGroup<T> = { items: T[]; total: number };
export type SearchGroupKey = "pages" | "courses" | "knowledge" | "actions";
export type GlobalSearchResults = {
  query: string;
  pages: RankedGroup<PageSearchItem>;
  courses: RankedGroup<CourseSearchItem>;
  knowledge: RankedGroup<KnowledgeSearchItem>;
  actions: RankedGroup<ActionSearchItem>;
  /** Groups ordered by their best match; exact/prefix title hits always lead. */
  groupOrder: SearchGroupKey[];
  empty: boolean;
};

/** Stable type order only breaks a same-relevance tie. */
const SEARCH_GROUP_TYPE_RANK: Record<SearchGroupKey, number> = {
  pages: 0,
  courses: 1,
  knowledge: 2,
  actions: 3
};

const PAGE_DEFINITIONS: Array<PageSearchItem & { requiresSession?: boolean; requiresTeaching?: boolean; requiresAdmin?: boolean }> = [
  { id: "home", title: "首页", path: "/", keywords: ["home", "今日", "学习"], requiresSession: false },
  { id: "archive", title: "地图", path: "/archive", keywords: ["archive", "知识图谱", "知识", "星图", "我的地图"], requiresSession: false },
  { id: "works", title: "作品", path: "/works", keywords: ["works", "工作流", "实践", "提交"], requiresSession: true },
  { id: "records", title: "记录", path: "/records", keywords: ["records", "活动", "时间线"], requiresSession: true },
  { id: "settings", title: "设置", path: "/settings", keywords: ["settings", "账户", "通知", "隐私"], requiresSession: true },
  { id: "teaching", title: "教学 · 课程管理", path: "/teaching", keywords: ["teaching", "课程", "教师"], requiresSession: true, requiresTeaching: true },
  { id: "admin", title: "管理 · 用户与角色", path: "/admin", keywords: ["admin", "管理", "知识领域", "用户", "角色"], requiresSession: true, requiresAdmin: true }
];

export function buildPageSearchItems(session: Pick<MockSession, "role" | "capabilities"> | null) {
  return PAGE_DEFINITIONS.filter((page) => {
    if (page.requiresSession && !session) return false;
    if (page.requiresTeaching && !canManageCourses(session)) return false;
    if (page.requiresAdmin && !canManageKnowledgeDomains(session)) return false;
    return true;
  }).map(({ requiresSession: _session, requiresTeaching: _teaching, requiresAdmin: _admin, ...page }) => page);
}

function courseStateMeta(course: ArchiveCourse) {
  if (course.state === "active") return `${course.chapterCount} 章 · ${course.progress}%`;
  if (course.state === "draft") return `${course.chapterCount} 章 · 草稿`;
  if (course.state === "recommended") return `${course.chapterCount} 章 · 可加入`;
  return `${course.chapterCount} 章 · 已发布`;
}

function nodeCourseLocation(node: ArchiveNode, runtimes: readonly CourseRuntimeData[]) {
  const contexts = node.courseContexts;
  for (const context of contexts) {
    const runtime = runtimes.find((item) => item.course.id === context.courseId);
    if (!runtime) continue;
    const coverage = runtime.curriculumCoverages
      .filter((item) => item.nodeId === node.id)
      .slice()
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0];
    if (!coverage) continue;
    const lesson = runtime.lessons.find((item) => item.id === coverage.lessonId);
    const chapter = lesson ? chapterDisplayNumber(runtime.chapters, lesson.chapterId) : undefined;
    if (chapter !== undefined) return { course: runtime.course, chapter };
  }
  return null;
}

/** Search shows the object's real state; "当前" belongs only to the route's navigation step. */
export function knowledgeSearchStatus(node: Pick<ArchiveNode, "isMine" | "status" | "scope">) {
  return node.isMine ? knowledgeStateLabelFor(node.status) : knowledgeScopeLabelFor(node.scope);
}

function knowledgeMeta(node: ArchiveNode, runtimes: readonly CourseRuntimeData[]) {
  const location = nodeCourseLocation(node, runtimes);
  const status = knowledgeSearchStatus(node);
  return location ? `第 ${location.chapter} 章 · ${status}` : `${node.domainTitle} · ${status}`;
}

function knowledgeKeywords(node: ArchiveNode, runtimes: readonly CourseRuntimeData[]) {
  const location = nodeCourseLocation(node, runtimes);
  return [
    node.domainTitle,
    node.description,
    ...node.courseContexts.map((context) => context.courseTitle),
    ...(location ? [location.course.title] : [])
  ];
}

function buildKnowledgeItems(model: ReturnType<typeof buildArchiveModel>, runtimes: readonly CourseRuntimeData[]): KnowledgeSearchItem[] {
  const statusRank: Record<UserKnowledgeStatus | "explore", number> = { learning: 0, practicing: 1, learned: 2, mastered: 3, explore: 4 };
  return model.nodes
    .slice()
    .sort((left, right) => statusRank[left.status] - statusRank[right.status]
      || right.visualImportance - left.visualImportance
      || left.title.localeCompare(right.title, "zh-CN"))
    .map((node) => ({
      id: node.id,
      title: node.title,
      meta: knowledgeMeta(node, runtimes),
      keywords: knowledgeKeywords(node, runtimes),
      status: node.status,
      ...(node.updatedAt ? { updatedAt: node.updatedAt } : {})
    }));
}

function buildCourseItems(model: ReturnType<typeof buildArchiveModel>, nodeById: Map<string, ArchiveNode>): CourseSearchItem[] {
  return model.courses.map((course) => ({
    id: course.id,
    title: course.title,
    meta: courseStateMeta(course),
    keywords: [
      course.subtitle ?? "",
      course.description,
      course.state === "active" ? "在学" : course.state === "draft" ? "草稿" : course.state === "recommended" ? "可加入" : "已发布",
      ...course.coveredKnowledgeIds.flatMap((id) => {
        const node = nodeById.get(id);
        return node ? [node.title, node.description] : [];
      })
    ],
    state: course.state,
    progress: course.progress,
    updatedAt: course.updatedAt
  }));
}

function buildActionItems(currentCourseId: string | undefined): ActionSearchItem[] {
  const actions: ActionSearchItem[] = [
    { id: "new-workflow", title: "新建工作流", meta: "进入新建", keywords: ["workflow", "工作流", "新建", "创作", "works"] }
  ];
  if (currentCourseId) actions.push({ id: "continue-course", title: "继续当前课程", meta: "课程", keywords: ["continue", "课程", "继续", "学习"], courseId: currentCourseId });
  actions.push(
    { id: "open-records", title: "打开记录", meta: "记录", keywords: ["records", "记录", "活动"] },
    { id: "open-settings", title: "打开设置", meta: "设置", keywords: ["settings", "设置", "账户"] },
    { id: "open-assistant", title: "打开助手", meta: "EduFlow Assistant", keywords: ["assistant", "助手", "对话", "AI"] }
  );
  return actions;
}

export function buildGlobalSearchData(input: {
  session: MockSession | null;
  graph: KnowledgeGraph;
  governance: DomainGovernanceState;
  runtimes: CourseRuntimeData[];
  records: readonly UserKnowledgeRecord[];
  courseStates?: ReadonlyMap<string, UserCourseState>;
}): GlobalSearchData {
  let model: ReturnType<typeof buildArchiveModel> | null = null;
  try {
    model = buildArchiveModel({
      graph: input.graph,
      governance: input.governance,
      runtimes: input.runtimes,
      records: input.records,
      courseStates: input.courseStates
    });
  } catch {
    model = null;
  }
  const nodeById = model?.nodeById ?? new Map<string, ArchiveNode>();
  const activeCourse = model?.courses
    .filter((course) => course.state === "active")
    .slice()
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.id.localeCompare(right.id))[0];
  return {
    pages: buildPageSearchItems(input.session),
    courses: model ? buildCourseItems(model, nodeById) : [],
    knowledge: model ? buildKnowledgeItems(model, input.runtimes) : [],
    actions: input.session ? buildActionItems(activeCourse?.id) : [],
    currentCourseId: activeCourse?.id
  };
}

export function visibleSearchRuntimes(runtimes: readonly CourseRuntimeData[], session: MockSession | null) {
  return runtimes.filter((runtime) => isCourseVisibleToViewer(runtime.course, session?.userId));
}

const LATIN_WORD = /[a-z0-9]+/g;

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizedWords(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().match(LATIN_WORD) ?? [];
}

function editDistanceWithin(left: string, right: string, limit: number) {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMin = row;
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      const value = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
      current[column] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return false;
    previous = current;
  }
  return previous[right.length] <= limit;
}

function fuzzyLatinMatch(haystack: string, query: string) {
  const queryWords = normalizedWords(query).filter((word) => word.length >= 3);
  if (!queryWords.length) return false;
  const haystackWords = normalizedWords(haystack);
  return queryWords.every((queryWord) => haystackWords.some((word) => {
    if (word.startsWith(queryWord) || queryWord.startsWith(word)) return Math.min(word.length, queryWord.length) >= 3;
    const limit = queryWord.length <= 4 ? 1 : queryWord.length <= 8 ? 2 : 3;
    return editDistanceWithin(queryWord, word, limit);
  }));
}

/**
 * Relevance tiers: 0 exact title, 1 title prefix, 2 title contains, 3 any other
 * field (including a fuzzy Latin hit). Lower is stronger.
 */
export type SearchRelevanceTier = 0 | 1 | 2 | 3;
export type SearchScore = { relevance: SearchRelevanceTier; updatedAt: number };

export function relevanceScore(title: string, fields: readonly string[], rawQuery: string): SearchRelevanceTier | null {
  const query = normalize(rawQuery);
  if (!query) return null;
  const normalizedTitle = normalize(title);
  if (normalizedTitle === query) return 0;
  if (normalizedTitle.startsWith(query)) return 1;
  if (normalizedTitle.includes(query)) return 2;
  const normalizedFields = fields.map(normalize).filter(Boolean);
  if (normalizedFields.some((value) => value.includes(query))) return 3;
  if (fuzzyLatinMatch([title, ...fields].join(" "), rawQuery)) return 3;
  return null;
}

function updatedAtValue(value: string | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

export function scoreSearchItem(
  item: { title: string; keywords: readonly string[]; updatedAt?: string },
  rawQuery: string
): SearchScore | null {
  const relevance = relevanceScore(item.title, item.keywords, rawQuery);
  return relevance === null ? null : { relevance, updatedAt: updatedAtValue(item.updatedAt) };
}

/** Null means no match; lower is a stronger title-first hit. */
export function relevance(title: string, description: readonly string[], rawQuery: string): number | null {
  const tier = relevanceScore(title, description, rawQuery);
  if (tier === null) return null;
  // Preserve the original legacy score scale consumed by older callers.
  return tier === 3 ? 4 : tier;
}

type RankedGroupResult<T> = RankedGroup<T> & { best: SearchScore | null };

function rankGroup<T extends { title: string; keywords: string[]; updatedAt?: string }>(items: T[], rawQuery: string): RankedGroupResult<T> {
  const query = rawQuery.trim();
  if (!query) return { items: items.slice(), total: items.length, best: null };
  const ranked = items
    .map((item, index) => ({ item, index, score: scoreSearchItem(item, query) }))
    .filter((entry): entry is { item: T; index: number; score: SearchScore } => entry.score !== null)
    .sort((left, right) => left.score.relevance - right.score.relevance
      || right.score.updatedAt - left.score.updatedAt
      || left.index - right.index);
  return {
    items: ranked.map((entry) => entry.item),
    total: ranked.length,
    best: ranked[0]?.score ?? null
  };
}

export function filterGlobalSearch(data: GlobalSearchData, rawQuery: string, limits: Partial<Record<"pages" | "courses" | "knowledge" | "actions", number>> = {}): GlobalSearchResults {
  const query = rawQuery.trim();
  const ranked = {
    pages: rankGroup(data.pages, query),
    courses: rankGroup(data.courses, query),
    knowledge: rankGroup(data.knowledge, query),
    actions: rankGroup(data.actions, query)
  } satisfies Record<SearchGroupKey, RankedGroupResult<unknown>>;
  const baseOrder: SearchGroupKey[] = ["pages", "courses", "knowledge", "actions"];
  const groupOrder = baseOrder
    .filter((key) => !query || ranked[key].total > 0)
    .slice()
    .sort((left, right) => {
      if (!query) return 0;
      const leftBest = ranked[left].best!;
      const rightBest = ranked[right].best!;
      return leftBest.relevance - rightBest.relevance
        || SEARCH_GROUP_TYPE_RANK[left] - SEARCH_GROUP_TYPE_RANK[right]
        || rightBest.updatedAt - leftBest.updatedAt;
    });
  return {
    query,
    pages: { items: ranked.pages.items.slice(0, limits.pages ?? (query ? 8 : 7)), total: ranked.pages.total },
    courses: { items: ranked.courses.items.slice(0, limits.courses ?? 3), total: ranked.courses.total },
    knowledge: { items: ranked.knowledge.items.slice(0, limits.knowledge ?? 3), total: ranked.knowledge.total },
    actions: { items: ranked.actions.items.slice(0, limits.actions ?? 6), total: ranked.actions.total },
    groupOrder,
    empty: ranked.pages.total + ranked.courses.total + ranked.knowledge.total + ranked.actions.total === 0
  };
}
