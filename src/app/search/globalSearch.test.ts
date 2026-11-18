import { describe, expect, it } from "vitest";
import { buildPageSearchItems, filterGlobalSearch, knowledgeCourseMeta, knowledgeSearchStatus, relevance, relevanceScore, type GlobalSearchData } from "./globalSearch";

const data: GlobalSearchData = {
  pages: buildPageSearchItems({ role: "admin", capabilities: ["global-domain-admin"] }),
  courses: [
    { id: "c-agent", title: "Agent 工程实践", meta: "6 章 · 34%", keywords: ["工具调用", "RAG", "多智能体"], state: "active", progress: 34 },
    { id: "c-python", title: "Python Engineering", meta: "4 章 · 可加入", keywords: ["异步", "测试"], state: "recommended", progress: 0 }
  ],
  knowledge: [
    { id: "k-tool", title: "工具调用", meta: "第 4 章 · 在学", keywords: ["Agent 工程实践", "函数"], status: "learning" },
    { id: "k-state", title: "状态快照", meta: "第 2 章 · 在学", keywords: ["Agent 工程实践", "运行时"], status: "learning" }
  ],
  actions: [
    { id: "new-workflow", title: "新建工作流", meta: "进入新建", keywords: ["workflow", "新建"] },
    { id: "open-settings", title: "打开设置", meta: "设置", keywords: ["settings"] }
  ],
  currentCourseId: "c-agent"
};

describe("global search model", () => {
  it("keeps page results permission-aware", () => {
    expect(buildPageSearchItems(null).map((page) => page.id)).toEqual(["home", "archive"]);
    expect(buildPageSearchItems({ role: "student", capabilities: [] }).map((page) => page.id)).toEqual(["home", "archive", "works", "records", "settings"]);
    expect(buildPageSearchItems({ role: "teacher", capabilities: [] }).map((page) => page.id)).toContain("teaching");
    expect(buildPageSearchItems({ role: "admin", capabilities: [] }).map((page) => page.id)).toContain("admin");
  });

  it("matches Chinese substrings and case-insensitive or slightly misspelled English", () => {
    expect(relevance("工具调用", [], "工具")).toBe(1);
    expect(relevance("工具调用", [], "调用")).toBe(2);
    expect(relevance("Python Engineering", [], "PYTHON")).not.toBeNull();
    expect(relevance("LangGraph 实战", [], "langgraphh")).toBe(4);
  });

  it("filters every group by relevance and reports a real empty state", () => {
    const hit = filterGlobalSearch(data, "agent");
    expect(hit.courses.items.map((course) => course.id)).toEqual(["c-agent"]);
    expect(hit.pages.items.some((page) => page.id === "admin")).toBe(false);
    expect(hit.empty).toBe(false);

    const typo = filterGlobalSearch(data, "pythn");
    expect(typo.courses.items.map((course) => course.id)).toEqual(["c-python"]);

    const empty = filterGlobalSearch(data, "没有这个内容");
    expect(empty).toMatchObject({ pages: { total: 0 }, courses: { total: 0 }, knowledge: { total: 0 }, actions: { total: 0 }, empty: true });
  });

  it("uses exact/prefix title hits before title contains and other-field hits", () => {
    expect(relevanceScore("ReAct", [], "ReAct")).toBe(0);
    expect(relevanceScore("ReAct 循环", [], "ReAct")).toBe(1);
    expect(relevanceScore("理解 ReAct 反馈", [], "ReAct")).toBe(2);
    expect(relevanceScore("Agent 工程实践", ["ReAct 循环"], "ReAct")).toBe(3);
    expect(relevanceScore("Python Engineering", [], "ReAct")).toBeNull();
  });

  it("ranks a real knowledge title hit above courses that only mention it in covered Knowledge", () => {
    const reactData: GlobalSearchData = {
      ...data,
      pages: [],
      actions: [],
      courses: [
        { id: "c-a", title: "Agent 工程实践", meta: "6 章 · 34%", keywords: ["ReAct"], state: "active", progress: 34 },
        { id: "c-b", title: "LangGraph 实战", meta: "5 章 · 10%", keywords: ["ReAct"], state: "published", progress: 0 },
        { id: "c-c", title: "工具调用深入", meta: "4 章 · 0%", keywords: ["ReAct"], state: "recommended", progress: 0 }
      ],
      knowledge: [
        { id: "k-react", title: "ReAct 循环", meta: "第 4 章 · 在学", keywords: ["Agent 工程实践"], status: "learning", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "k-other", title: "其他知识", meta: "第 2 章 · 未开始", keywords: ["ReAct"], status: "explore" }
      ]
    };
    const hit = filterGlobalSearch(reactData, "ReAct", { knowledge: 3, courses: 3 });
    expect(hit.groupOrder[0]).toBe("knowledge");
    expect(hit.knowledge.items[0].title).toBe("ReAct 循环");
    expect(hit.courses.total).toBe(3);
  });

  it("breaks same-tier knowledge matches by recent use", () => {
    const recent: GlobalSearchData = {
      ...data,
      pages: [],
      actions: [],
      courses: [],
      knowledge: [
        { id: "k-old", title: "ReAct 旧", meta: "", keywords: [], status: "learning", updatedAt: "2025-01-01T00:00:00.000Z" },
        { id: "k-new", title: "ReAct 新", meta: "", keywords: [], status: "learning", updatedAt: "2026-06-01T00:00:00.000Z" }
      ]
    };
    expect(filterGlobalSearch(recent, "ReAct").knowledge.items.map((item) => item.id)).toEqual(["k-new", "k-old"]);
  });

  it("puts the owning Course before a Knowledge chapter and truncates long titles", () => {
    expect(knowledgeCourseMeta("Agent 工程实践", 4, "在学")).toBe("Agent 工程实践 · 第 4 章 · 在学");
    expect(knowledgeCourseMeta("一门名字特别特别长的课程", 2, "未开始", 6)).toBe("一门名字特别… · 第 2 章 · 未开始");
  });

  it("shows truthful Knowledge states and never invents 当前 from recency", () => {
    expect(knowledgeSearchStatus({ isMine: true, status: "learned", scope: "global" })).toBe("已学");
    expect(knowledgeSearchStatus({ isMine: true, status: "learning", scope: "global" })).toBe("在学");
    expect(knowledgeSearchStatus({ isMine: false, status: "explore", scope: "global" })).toBe("公开可见");
  });

  it("caps default results while keeping page and action groups complete", () => {
    const result = filterGlobalSearch(data, "");
    expect(result.pages.items).toHaveLength(7);
    expect(result.actions.items).toHaveLength(2);
    expect(result.courses.items).toHaveLength(2);
    expect(result.knowledge.items).toHaveLength(2);
  });
});
