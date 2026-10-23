import { describe, expect, it } from "vitest";
import { productWorkflowTemplates } from "./productWorkflowTemplates";
import { templateCapabilities } from "@/features/workflow/domain/v2/templateCapabilities";
import { unresolvedCapabilities } from "@/features/workflow/domain/v2/connectionReferences";
import { validateWorkflowDraft } from "@/features/workflow/domain/v2/validation";

describe("local product workflow template drafts", () => {
  it("keeps stable ids, chains every node and leaves capabilities unbound", () => {
    const templates = productWorkflowTemplates();
    expect(templates.map(item => item.definition.workflowId)).toEqual(Object.keys(templateCapabilities));
    for (const template of templates) {
      const definition = template.definition;
      expect(definition.schemaVersion).toBe("2.0");
      expect(definition.nodes.length).toBeGreaterThan(2);
      expect(definition.transitions).toHaveLength(definition.nodes.length - 1);
      expect(definition.transitions.every(edge => edge.outlet === "next")).toBe(true);
      expect(unresolvedCapabilities(definition)).toHaveLength(templateCapabilities[definition.workflowId].length);
      expect(definition.requiredCapabilities).toContain("llm");
    }
  });

  it("uses typeVersion 2 model and tool nodes with structured prompts and Schema-ready inputs", () => {
    const [brief] = productWorkflowTemplates();
    const tools = brief.definition.nodes.filter(node => node.type === "core.tool");
    expect(tools).toHaveLength(3);
    // The public HTTP tools are created by the user later, so their inputSchema is unknown here.
    // The v2 parameter table starts empty and M11 fills it from the bound tool's Schema.
    expect(tools.every(node => node.typeVersion === 2 && node.config.toolRef === "" && Object.keys(node.inputs).length === 0)).toBe(true);
    expect(tools.some(node => Object.prototype.hasOwnProperty.call(node.inputs, "arguments"))).toBe(false);
    expect(tools.map(node => Object.values(node.writes)[0])).toEqual(["/result/hits", "/result/items", "/result"]);
    expect(brief.definition.nodes.filter(node => node.type === "core.function")).toHaveLength(1);
    const models = brief.definition.nodes.filter(node => node.type === "core.llm");
    expect(models).toHaveLength(1);
    expect(models[0].typeVersion).toBe(2);
    expect(models[0].config.prompt).toEqual({
      system: [{ type: "text", text: "你是严谨的中文技术编辑，只依据提供的公开资料写作，必须引用来源，不编造事实。" }],
      messages: [{ role: "user", content: [{ type: "text", text: "请用不超过 250 字的中文技术简报概括以上公开资料，必须引用来源。" }] }],
    });
    expect(models[0].inputs).toEqual({ history: { source: "state", pointer: "/messages", onMissing: { mode: "error" } } });
    expect(models[0].writes).toEqual({ messages: "/messages" });
  });

  it("keeps every fixture on the current node versions and free of frontend draft errors", () => {
    for (const template of productWorkflowTemplates()) {
      const definition = template.definition;
      for (const node of definition.nodes) {
        if (node.type === "core.llm" || node.type === "core.tool") expect(node.typeVersion).toBe(2);
      }
      expect(validateWorkflowDraft(definition).filter(item => item.severity === "error")).toEqual([]);
    }
  });
});
