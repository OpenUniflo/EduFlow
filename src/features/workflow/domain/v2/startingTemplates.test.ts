import { describe, expect, it } from "vitest";
import { createWorkflowV2 } from "./factory";
import { applyStartingTemplate, startingTemplateChain, startingTemplateVisual } from "./startingTemplates";
import { syntheticStarterTemplate } from "../../../../../tests/fixtures/workflowTemplates";

const options = { providerRef: "provider", modelRef: "deepseek-chat", hnTool: { ref: "hn_search", contractDigest: "digest" } };

describe("server-provided starting templates", () => {
  it("applies a fetched definition to the current Workflow identity", () => {
    const document = applyStartingTemplate(syntheticStarterTemplate(), createWorkflowV2("我的流程"), options);
    expect(document.definition.workflowId).toBe("");
    expect(document.definition.name).toBe("我的流程");
    expect(document.definition.description).toBe("Synthetic starter description.");
    expect(document.definition.nodes.map(node => node.id)).toEqual(["start", "keywords", "search", "answer", "end"]);
    expect(document.definition.transitions.map(edge => edge.id)).toEqual(["start:next:keywords", "keywords:next:search", "search:next:answer", "answer:next:end"]);
  });

  it("binds empty model and tool capabilities without changing the template graph", () => {
    const document = applyStartingTemplate(syntheticStarterTemplate(), createWorkflowV2(), options);
    const answer = document.definition.nodes.find(node => node.id === "answer");
    const search = document.definition.nodes.find(node => node.id === "search");
    expect(answer?.config.providerRef).toBe("provider");
    expect(answer?.config.modelRef).toBe("deepseek-chat");
    expect(answer?.config.modelParameters).toEqual({ thinking: { type: "disabled" } });
    expect(search?.config).toEqual({ toolRef: "hn_search", contractDigest: "digest" });
    expect(search?.inputs.query).toEqual({ source: "state", pointer: "/keywords", onMissing: { mode: "error" } });
    expect(search?.writes.hits).toBe("/result/hits");
  });

  it("derives presentation helpers from the definition, not a bundled product identity", () => {
    const definition = syntheticStarterTemplate();
    expect(startingTemplateVisual(definition)).toBe("search");
    expect(startingTemplateChain(definition)).toBe("模型 → 工具 → 模型 → 结束");
    expect(startingTemplateVisual(undefined)).toBe("flow");
  });
});
