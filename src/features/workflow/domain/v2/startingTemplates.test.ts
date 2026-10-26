import { describe, expect, it } from "vitest";
import { createWorkflowV2 } from "./factory";
import { createStartingTemplate, startingTemplateCards } from "./startingTemplates";

const options = { providerRef: "provider", modelRef: "deepseek-chat", hnTool: { ref: "hn_search", contractDigest: "digest" } };

describe("product starting templates", () => {
  it("offers the three first-run cards", () => {
    expect(startingTemplateCards.map(card => card.title)).toEqual(["问答助手", "先搜索再总结", "按问题类型分流"]);
  });
  it("builds a Q&A flow with configured State, input binding and prompt", () => {
    const document = createStartingTemplate("assistant", createWorkflowV2("我的流程"), options);
    const model = document.definition.nodes.find(node => node.type === "core.llm");
    expect(model?.config.providerRef).toBe("provider");
    expect(model?.inputs.question).toEqual({ source: "input", pointer: "/question", onMissing: { mode: "error" } });
    expect(document.definition.state.inputBindings.question).toEqual({ source: "input", pointer: "/question", onMissing: { mode: "error" } });
    expect(document.definition.outputBindings.answer).toEqual({ source: "state", pointer: "/answer", onMissing: { mode: "error" } });
    expect(JSON.stringify(model?.config.prompt)).toContain("question");
  });
  it("extracts model-authored keywords before the real HN search tool runs", () => {
    const document = createStartingTemplate("search", createWorkflowV2(), options);
    const search = document.definition.nodes.find(node => node.type === "core.tool");
    expect(search?.config).toEqual({ toolRef: "hn_search", contractDigest: "digest" });
    expect(search?.inputs.query).toEqual({ source: "state", pointer: "/keywords", onMissing: { mode: "error" } });
    expect(search?.writes.hits).toBe("/result/hits");
    const extract = document.definition.nodes.find(node => node.id === "keywords");
    expect(extract?.type).toBe("core.llm");
    expect(extract?.writes.keywords).toBe("/text");
    expect(document.definition.transitions.map(edge => `${edge.from}:${edge.outlet}:${edge.to}`)).toEqual(["start:next:keywords", "keywords:next:search", "search:next:answer", "answer:next:end"]);
    expect(document.definition.state.reducers.keywords).toEqual({ name: "replace", version: 1 });
  });
  it("wires every router outlet so triage is runnable", () => {
    const document = createStartingTemplate("triage", createWorkflowV2(), options);
    const router = document.definition.nodes.find(node => node.type === "core.router");
    expect(router).toBeTruthy();
    const outlets = document.definition.transitions.filter(edge => edge.from === router!.id).map(edge => edge.outlet).sort();
    expect(outlets).toEqual(["learning", "other", "technical"]);
    expect((router!.config.cases as { label: string }[]).map(item => item.label)).toEqual(["学习", "技术"]);
    expect(router!.config.defaultLabel).toBe("其他");
    const technical = document.definition.nodes.find(node => node.id === "technical");
    expect(technical?.config.modelParameters).toEqual({ thinking: { type: "disabled" } });
  });
});

it("asks for two or three core English nouns and adds the Algolia fallback to the built-in search", () => {
  const document = createStartingTemplate("search", createWorkflowV2(), { providerRef: "p", modelRef: "deepseek-flash" });
  const keywords = document.definition.nodes.find(node => node.id === "keywords");
  const prompt = JSON.stringify(keywords?.config.prompt);
  expect(prompt).toContain("2–3 个核心英文名词");
  expect(prompt).toContain("不要年份");
  expect(prompt).toContain("trending");
  const search = document.definition.nodes.find(node => node.id === "search");
  expect(search?.config.toolRef).toBe("hn_search");
});
