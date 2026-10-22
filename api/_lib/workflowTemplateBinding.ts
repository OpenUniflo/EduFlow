export type TemplateBinding = {
  nodeId: string;
  graphPath: string[];
  field: "providerRef" | "toolRef";
  reference: string;
  modelRef?: string;
  contractDigest?: string;
};

export type TemplateCatalog = {
  providers: { ref: string; modelRefs: string[] }[];
  tools: { ref: string; available?: boolean; contractDigest?: string }[];
};

export type UnresolvedTemplateCapability = {
  nodeId: string;
  graphPath: string[];
  field: "providerRef" | "toolRef";
  kind: "provider" | "tool";
  label: string;
};

export class TemplateBindingError extends Error {
  constructor(public code: "INVALID_BINDING" | "MISSING_CAPABILITY" | "CONTRACT_CHANGED", message: string) { super(message); }
}

type Node = { id?: unknown; type?: unknown; label?: unknown; config?: Record<string, unknown> };
type Definition = { nodes?: unknown };

function isDefinition(value: unknown): value is Definition {
  return Boolean(value && typeof value === "object" && Array.isArray((value as Definition).nodes));
}

function walk(definition: Definition, graphPath: string[], visit: (node: Node, graphPath: string[]) => void) {
  for (const value of definition.nodes as unknown[]) {
    if (!value || typeof value !== "object") continue;
    const node = value as Node;
    visit(node, graphPath);
    const graph = node.config?.graph;
    if (node.type === "core.subgraph" && isDefinition(graph)) walk(graph, [...graphPath, String(node.id)], visit);
  }
}

export function unresolvedTemplateCapabilities(definition: unknown): UnresolvedTemplateCapability[] {
  if (!isDefinition(definition)) return [];
  const unresolved: UnresolvedTemplateCapability[] = [];
  walk(definition, [], (node, graphPath) => {
    const config = node.config ?? {};
    if (node.type === "core.llm" && typeof config.providerRef === "string" && !config.providerRef.trim()) {
      unresolved.push({ nodeId: String(node.id), graphPath, field: "providerRef", kind: "provider", label: String(node.label ?? node.id) });
    }
    if (node.type === "core.tool" && typeof config.toolRef === "string" && !config.toolRef.trim()) {
      unresolved.push({ nodeId: String(node.id), graphPath, field: "toolRef", kind: "tool", label: String(node.label ?? node.id) });
    }
  });
  return unresolved;
}

function findNode(definition: Definition, graphPath: string[], nodeId: string): Node | undefined {
  let graph = definition;
  for (const segment of graphPath) {
    let parent: Node | undefined;
    for (const value of graph.nodes as unknown[]) {
      if (value && typeof value === "object" && String((value as Node).id) === segment) { parent = value as Node; break; }
    }
    const child = parent?.config?.graph;
    if (!isDefinition(child)) return undefined;
    graph = child;
  }
  for (const value of graph.nodes as unknown[]) {
    if (value && typeof value === "object" && String((value as Node).id) === nodeId) return value as Node;
  }
  return undefined;
}

export function applyTemplateBindings(definition: unknown, bindings: readonly TemplateBinding[]): Record<string, unknown> {
  if (!isDefinition(definition)) throw new TemplateBindingError("INVALID_BINDING", "Template definition is invalid");
  const next = structuredClone(definition) as Definition & Record<string, unknown>;
  const seen = new Set<string>();
  for (const binding of bindings) {
    const target = `${binding.graphPath.join("/")}:${binding.nodeId}:${binding.field}`;
    if (seen.has(target)) throw new TemplateBindingError("INVALID_BINDING", "Duplicate template binding target");
    seen.add(target);
    const node = findNode(next, binding.graphPath, binding.nodeId);
    if (!node || !node.config) throw new TemplateBindingError("INVALID_BINDING", "Template binding target does not exist");
    if (binding.field === "providerRef") {
      if (node.type !== "core.llm") throw new TemplateBindingError("INVALID_BINDING", "providerRef binding requires a model node");
      node.config.providerRef = binding.reference;
      if (binding.modelRef) node.config.modelRef = binding.modelRef;
    } else {
      if (node.type !== "core.tool") throw new TemplateBindingError("INVALID_BINDING", "toolRef binding requires a tool node");
      node.config.toolRef = binding.reference;
      if (binding.contractDigest) node.config.contractDigest = binding.contractDigest;
    }
  }
  return next as Record<string, unknown>;
}

export function validateTemplateBindings(bindings: readonly TemplateBinding[], catalog: TemplateCatalog) {
  for (const binding of bindings) {
    if (binding.field === "providerRef") {
      const provider = catalog.providers.find(item => item.ref === binding.reference);
      if (!provider) throw new TemplateBindingError("MISSING_CAPABILITY", "Model connection is not available to this account");
      if (binding.modelRef && !provider.modelRefs.includes(binding.modelRef)) throw new TemplateBindingError("MISSING_CAPABILITY", "Model is not available in this connection");
    } else {
      const tool = catalog.tools.find(item => item.ref === binding.reference);
      if (!tool || tool.available === false) throw new TemplateBindingError("MISSING_CAPABILITY", "Tool connection is not available to this account");
      if (binding.contractDigest && tool.contractDigest && binding.contractDigest !== tool.contractDigest) throw new TemplateBindingError("CONTRACT_CHANGED", "Tool contract changed; refresh the tool catalog");
    }
  }
}
