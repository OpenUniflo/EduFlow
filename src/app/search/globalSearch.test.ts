import { describe, expect, it } from "vitest";
import { buildPageSearchItems, filterGlobalSearch, relevance, type GlobalSearchData } from "./globalSearch";

const data: GlobalSearchData = {
  pages: buildPageSearchItems({ role: "admin", capabilities: ["global-domain-admin"] }),
  courses: [
    { id: "c-agent", title: "Agent 工程实践", meta: "6 章 · 34%", keywords: ["工具调用", "RAG", "多智能体"], state: "active", progress: 34 },
    { id: "c-python", title: "Python Engineering", meta: "4 章 · 可加入", keywords: ["异步", "测试"], state: "recommended", progress: 0 }
  ],
  knowledge: [
    { id: "k-tool", title: "工具调用", meta: "第 4 章 · 当前", keywords: ["Agent 工程实践", "函数"], status: "learning", isCurrent: true },
    { id: "k-state", title: "状态快照", meta: "第 2 章 · 在学", keywords: ["Agent 工程实践", "运行时"], status: "learning", isCurrent: false }
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

  it("caps default results while keeping page and action groups complete", () => {
    const result = filterGlobalSearch(data, "");
    expect(result.pages.items).toHaveLength(7);
    expect(result.actions.items).toHaveLength(2);
    expect(result.courses.items).toHaveLength(2);
    expect(result.knowledge.items).toHaveLength(2);
  });
});
