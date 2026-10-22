import { describe, expect, it } from "vitest";
import { applyTemplateBindings, TemplateBindingError, unresolvedTemplateCapabilities, validateTemplateBindings, type TemplateBinding, type TemplateCatalog } from "../../api/_lib/workflowTemplateBinding";

const definition = {
  nodes: [
    { id: "model", type: "core.llm", label: "模型总结", config: { providerRef: "", modelRef: "" } },
    { id: "sub", type: "core.subgraph", label: "子图", config: { graph: { nodes: [{ id: "tool", type: "core.tool", label: "公开检索", config: { toolRef: "", contractDigest: "" } }] } } },
  ],
};
const catalog: TemplateCatalog = {
  providers: [{ ref: "p4:owner:model:2", modelRefs: ["deepseek-flash"] }],
  tools: [{ ref: "p4:owner:search:2", contractDigest: "digest", available: true }],
};
const bindings: TemplateBinding[] = [
  { nodeId: "model", graphPath: [], field: "providerRef", reference: "p4:owner:model:2", modelRef: "deepseek-flash" },
  { nodeId: "tool", graphPath: ["sub"], field: "toolRef", reference: "p4:owner:search:2", contractDigest: "digest" },
];

describe("server-side template binding", () => {
  it("finds unbound capabilities recursively and applies explicit bindings", () => {
    expect(unresolvedTemplateCapabilities(definition).map(item => `${item.nodeId}:${item.field}`)).toEqual(["model:providerRef", "tool:toolRef"]);
    const bound = applyTemplateBindings(definition, bindings) as typeof definition;
    expect(bound.nodes[0].config.providerRef).toBe("p4:owner:model:2");
    expect(bound.nodes[0].config.modelRef).toBe("deepseek-flash");
    const child = (bound.nodes[1].config.graph as typeof definition).nodes[0];
    expect(child.config.toolRef).toBe("p4:owner:search:2");
    expect(child.config.contractDigest).toBe("digest");
    expect(definition.nodes[0].config.providerRef).toBe("");
  });

  it("rejects missing targets, duplicate targets and wrong node types", () => {
    expect(() => applyTemplateBindings(definition, [{ ...bindings[0], nodeId: "missing" }])).toThrow(TemplateBindingError);
    expect(() => applyTemplateBindings(definition, [bindings[0], bindings[0]])).toThrow(TemplateBindingError);
    expect(() => applyTemplateBindings(definition, [{ ...bindings[1], graphPath: [], nodeId: "model" }])).toThrow(TemplateBindingError);
  });

  it("rejects references that are not available to this account or whose contract changed", () => {
    expect(() => validateTemplateBindings([{ ...bindings[0], reference: "p4:another:model:2" }], catalog)).toThrow(/not available/);
    expect(() => validateTemplateBindings([{ ...bindings[0], modelRef: "other-model" }], catalog)).toThrow(/not available/);
    expect(() => validateTemplateBindings([{ ...bindings[1], reference: "p4:another:search:2" }], catalog)).toThrow(/not available/);
    expect(() => validateTemplateBindings([{ ...bindings[1], contractDigest: "changed" }], catalog)).toThrow(/contract changed/);
    expect(() => validateTemplateBindings(bindings, catalog)).not.toThrow();
  });
});
