import { describe, expect, it } from "vitest";
import { workbenchSampleSummary } from "./NodeDebugDialog";

describe("workbenchSampleSummary", () => {
  it("summarizes conversation arrays instead of dumping raw JSON", () => {
    expect(workbenchSampleSummary([{ id: "lc_run--1", role: "user", content: [{ type: "text", text: "hi" }] }])).toBe("1 条对话");
    expect(workbenchSampleSummary([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toBe("2 条对话");
  });

  it("summarizes objects, lists and primitives", () => {
    expect(workbenchSampleSummary({ hits: [], total: 0 })).toBe("对象 · 2 个字段");
    expect(workbenchSampleSummary({})).toBe("空对象");
    expect(workbenchSampleSummary([])).toBe("0 项");
    expect(workbenchSampleSummary(["a", "b"])).toBe("2 项");
    expect(workbenchSampleSummary("简短文本")).toBe("简短文本");
    expect(workbenchSampleSummary(undefined)).toBe("最近一次运行没有值");
  });
});
