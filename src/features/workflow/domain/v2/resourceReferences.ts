import type { JsonValue, WorkflowDefinitionV2 } from "./types";
import { definitionScopes, variableReferences } from "./dataFlow";

export type WorkflowResourceKind = "provider" | "api" | "function" | "variable";

export type WorkflowResourceUsage = {
  nodeId: string;
  graphPath: string[];
  label: string;
  field?: "providerRef" | "toolRef" | "allowedToolRefs";
  index?: number;
  modelRef?: string;
  contractDigest?: string;
  functionVersion?: number;
};

/** One resource identity referenced by at least one node; usages keep every node that references it. */
export type WorkflowResourceReference = {
  key: string;
  kind: WorkflowResourceKind;
  ref: string;
  usages: WorkflowResourceUsage[];
  /** Inline function implementations are defined by the node itself, not the catalog. */
  inline?: { label: string; config: Record<string, JsonValue> };
};

function usageIdentity(graphPath: readonly string[], nodeId: string, index?: number) {
  return `${graphPath.join("/")}\u0000${nodeId}\u0000${index ?? ""}`;
}

function addReference(
  found: Map<string, WorkflowResourceReference>,
  input: Omit<WorkflowResourceReference, "usages">,
  usage: WorkflowResourceUsage,
) {
  const current = found.get(input.key);
  if (!current) {
    found.set(input.key, { ...input, usages: [usage] });
    return;
  }
  if (current.usages.some((item) => usageIdentity(item.graphPath, item.nodeId, item.index) === usageIdentity(usage.graphPath, usage.nodeId, usage.index))) return;
  current.usages.push(usage);
}

/**
 * Every resource a workflow's nodes actually reference, across subgraphs:
 * model providers, API/MCP tools, functions (registered and inline) and variables.
 * This is the single reference scan shared by the resource panel and version
 * update counts.
 */
export function workflowResourceReferences(definition: WorkflowDefinitionV2): WorkflowResourceReference[] {
  const found = new Map<string, WorkflowResourceReference>();
  const labels = new Map<string, string>();
  for (const scope of definitionScopes(definition)) {
    for (const node of scope.definition.nodes) {
      if (!node || typeof node !== "object") continue;
      const config = node.config as Record<string, JsonValue>;
      const usage: WorkflowResourceUsage = { nodeId: node.id, graphPath: scope.graphPath, label: node.label || node.id };
      if (!labels.has(node.id)) labels.set(node.id, node.label || node.id);
      if (node.type === "core.llm" && typeof config.providerRef === "string" && config.providerRef.trim()) {
        addReference(found, { key: `provider:${config.providerRef}`, kind: "provider", ref: config.providerRef }, {
          ...usage,
          field: "providerRef",
          ...(typeof config.modelRef === "string" && config.modelRef ? { modelRef: config.modelRef } : {}),
        });
      }
      if (node.type === "core.tool" && typeof config.toolRef === "string" && config.toolRef.trim()) {
        addReference(found, { key: `api:${config.toolRef}`, kind: "api", ref: config.toolRef }, {
          ...usage,
          field: "toolRef",
          ...(typeof config.contractDigest === "string" ? { contractDigest: config.contractDigest } : {}),
        });
      }
      if ((node.type === "core.llm" || node.type === "core.tool_dispatch") && Array.isArray(config.allowedToolRefs)) {
        config.allowedToolRefs.forEach((value, index) => {
          if (typeof value !== "string" || !value.trim()) return;
          addReference(found, { key: `api:${value}`, kind: "api", ref: value }, { ...usage, field: "allowedToolRefs", index });
        });
      }
      if (node.type === "core.function") {
        const implementation = String(config.implementation ?? "");
        if (implementation === "registered" && typeof config.functionRef === "string" && config.functionRef.trim()) {
          addReference(found, { key: `function:${config.functionRef}`, kind: "function", ref: config.functionRef }, {
            ...usage,
            ...(typeof config.functionVersion === "number" ? { functionVersion: config.functionVersion } : {}),
          });
        } else if (implementation === "code") {
          const ref = `inline:${node.id}`;
          addReference(found, {
            key: `function:${scope.graphPath.join("/")}:${ref}`,
            kind: "function",
            ref,
            inline: { label: node.label, config },
          }, usage);
        }
      }
    }
  }
  for (const reference of variableReferences(definition)) {
    addReference(found, { key: `variable:${reference.key}`, kind: "variable", ref: reference.key }, {
      nodeId: reference.nodeId,
      graphPath: reference.graphPath,
      label: labels.get(reference.nodeId) ?? reference.nodeId,
    });
  }
  return [...found.values()];
}
