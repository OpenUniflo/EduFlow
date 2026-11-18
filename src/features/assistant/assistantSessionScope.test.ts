import { describe, expect, it } from "vitest";
import {
  assistantSessionScopeForPath,
  assistantSessionSourceLabel,
  normalizeAssistantSessionSource,
  optionalAssistantSessionSource
} from "./assistantSessionScope";

describe("assistant conversation scopes", () => {
  it("keeps Home as the mainline and gives each contextual entry a stable source", () => {
    expect(assistantSessionScopeForPath("/")).toBe("home");
    expect(assistantSessionScopeForPath("/archive?panel=search")).toBe("page:archive");
    expect(assistantSessionScopeForPath("/works/workflow-1")).toBe("page:works:workflow-1");
    expect(assistantSessionScopeForPath("/courses/course-a/assignments/task-1")).toBe("page:assignment:course-a:task-1");
    expect(assistantSessionScopeForPath("/courses/course-a/materials/material-1")).toBe("page:material:course-a:material-1");
    expect(assistantSessionScopeForPath("/records")).toBe("page:records");
  });

  it("sanitizes dynamic identities so a path cannot become arbitrary source text", () => {
    expect(assistantSessionScopeForPath("/works/a b/../../x")).toBe("page:works:a-b");
    expect(assistantSessionScopeForPath("/courses/%E2%9C%93")).toBe("page:course:-");
  });

  it("validates source shapes on the server side and rejects arbitrary payloads", () => {
    expect(normalizeAssistantSessionSource(undefined)).toBe("home");
    expect(normalizeAssistantSessionSource(" archive-assistant ")).toBe("archive-assistant");
    expect(normalizeAssistantSessionSource("page:course:course-a")).toBe("page:course:course-a");
    expect(() => normalizeAssistantSessionSource("home; drop table")).toThrowError(/invalid/);
    expect(() => normalizeAssistantSessionSource("x".repeat(161))).toThrowError(/invalid/);
    expect(optionalAssistantSessionSource(undefined)).toBeNull();
    expect(optionalAssistantSessionSource("page:works:one")).toBe("page:works:one");
  });

  it("labels contextual conversations without inventing identity for Home", () => {
    expect(assistantSessionSourceLabel(undefined)).toBeUndefined();
    expect(assistantSessionSourceLabel("home")).toBeUndefined();
    expect(assistantSessionSourceLabel("archive-assistant")).toBe("地图 · 小助手");
    expect(assistantSessionSourceLabel("page:works:wf")).toBe("工作流");
    expect(assistantSessionSourceLabel("page:course:c")).toBe("课程");
    expect(assistantSessionSourceLabel("page:records")).toBe("记录");
    expect(assistantSessionSourceLabel("page:other")).toBe("页面对话");
  });
});
