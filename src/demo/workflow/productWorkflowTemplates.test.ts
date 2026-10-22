import { describe, expect, it } from "vitest";
import { productWorkflowTemplates } from "./productWorkflowTemplates";
import { templateCapabilities } from "@/features/workflow/domain/v2/templateCapabilities";
import { unresolvedCapabilities } from "@/features/workflow/domain/v2/connectionReferences";

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

  it("writes concrete fields out of the HTTP result wrapper and normalizes before the model", () => {
    const [brief] = productWorkflowTemplates();
    const tools = brief.definition.nodes.filter(node => node.type === "core.tool");
    expect(tools).toHaveLength(3);
    expect(tools.every(node => node.config.toolRef === "" && (node.inputs.arguments as { value: unknown }).value !== undefined)).toBe(true);
    expect(tools.map(node => Object.values(node.writes)[0])).toEqual(["/result/hits", "/result/extract", "/result"]);
    expect(brief.definition.nodes.filter(node => node.type === "core.function")).toHaveLength(1);
    expect(brief.definition.nodes.filter(node => node.type === "core.llm")).toHaveLength(1);
  });
});
