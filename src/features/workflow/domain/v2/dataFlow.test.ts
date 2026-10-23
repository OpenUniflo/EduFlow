import { describe, expect, it } from "vitest";
import type { Binding, JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";
import { defaultParamName, definitionScopes, GRAPH_OUTPUT_NODE_ID, pointerFieldName, stateFieldConsumers, stateFieldProducers, variableReferences } from "./dataFlow";

const policy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };
const stateBinding = (pointer: string): Binding => ({ source: "state", pointer, onMissing: { mode: "error" } });
const environmentBinding = (pointer: string): Binding => ({ source: "environment", pointer, onMissing: { mode: "error" } });
const literal = (value: JsonValue): Binding => ({ source: "literal", value });

function emptyDefinition(): WorkflowDefinitionV2 {
  return {
    schemaVersion: "2.0", workflowId: "workflow", revision: 1, name: "test", description: "",
    inputSchema: { type: "object" }, outputSchema: { type: "object" },
    state: { schema: { type: "object" }, initial: {}, inputBindings: {}, reducers: {} },
    entryNodeId: "start", nodes: [], transitions: [], outputBindings: {}, policy, requiredCapabilities: [],
  };
}

function node(id: string, type: string, config: Record<string, JsonValue> = {}): WorkflowNodeV2 {
  return { id, label: id, type, typeVersion: 1, config, inputs: {}, writes: {} };
}

function subgraphNode(id: string, graph: WorkflowDefinitionV2): WorkflowNodeV2 {
  return node(id, "core.subgraph", { graph: graph as unknown as JsonValue });
}

function writer(id: string, writes: Record<string, string>): WorkflowNodeV2 {
  return { ...node(id, "core.transform"), writes };
}

function router(id: string, predicate: Record<string, JsonValue>): WorkflowNodeV2 {
  return node(id, "core.router", { cases: [{ id: "case", priority: 1, predicate }], defaultOutlet: "default" });
}

describe("definitionScopes", () => {
  it("walks the root and nested subgraphs keyed by graphPath", () => {
    const leaf = emptyDefinition();
    leaf.nodes = [node("leaf-node", "core.transform")];
    const middle = emptyDefinition();
    middle.nodes = [subgraphNode("inner", leaf)];
    const root = emptyDefinition();
    root.nodes = [subgraphNode("outer", middle)];

    const scopes = definitionScopes(root);
    expect(scopes.map(scope => scope.graphPath)).toEqual([[], ["outer"], ["outer", "inner"]]);
    expect(scopes.map(scope => scope.scopeKey)).toEqual(["[]", '["outer"]', '["outer","inner"]']);
  });

  it("returns only the root scope for an empty definition", () => {
    expect(definitionScopes(emptyDefinition()).map(scope => scope.graphPath)).toEqual([[]]);
  });

  it("stops at the depth limit", () => {
    const leaf = emptyDefinition();
    const root = emptyDefinition();
    root.nodes = [subgraphNode("outer", leaf)];
    expect(definitionScopes(root, 0).map(scope => scope.graphPath)).toEqual([[]]);
    expect(definitionScopes(root, 1).map(scope => scope.graphPath)).toEqual([[], ["outer"]]);
  });

  it("does not recurse into a graph object that references one of its ancestors", () => {
    const root = emptyDefinition();
    const self = subgraphNode("self", root);
    root.nodes = [self];
    expect(definitionScopes(root)).toHaveLength(1);
  });

  it("ignores subgraph nodes whose config.graph is not a graph", () => {
    const root = emptyDefinition();
    root.nodes = [null as unknown as WorkflowNodeV2, node("sub", "core.subgraph", { graph: { nodes: "not-an-array" } as unknown as JsonValue })];
    expect(definitionScopes(root)).toHaveLength(1);
    expect(stateFieldProducers(root).size).toBe(0);
    expect(stateFieldConsumers(root).size).toBe(0);
    expect(variableReferences(root)).toEqual([]);
  });
});

describe("stateFieldProducers", () => {
  function graph(): WorkflowDefinitionV2 {
    const child = emptyDefinition();
    child.nodes = [
      writer("child-model", { text: "/answer" }),
      writer("child-shared", { message: "/messages" }),
    ];
    const root = emptyDefinition();
    root.nodes = [
      writer("model", { messages: "/messages", pendingCalls: "/toolCalls" }),
      subgraphNode("sub", child),
    ];
    return root;
  }

  it("maps written State fields to root and subgraph node ids without duplicates", () => {
    const producers = stateFieldProducers(graph());
    expect([...producers.keys()].sort()).toEqual(["message", "messages", "pendingCalls", "text"]);
    expect(producers.get("messages")).toEqual(["model"]);
    expect(producers.get("pendingCalls")).toEqual(["model"]);
    expect(producers.get("text")).toEqual(["child-model"]);
    expect(producers.get("message")).toEqual(["child-shared"]);
  });

  it("returns an empty map for a definition without nodes or writes", () => {
    expect(stateFieldProducers(emptyDefinition()).size).toBe(0);
  });

  it("treats write keys as State fields and skips only non-string output pointers", () => {
    const root = emptyDefinition();
    root.nodes = [
      writer("whole-output", { value: "" }),
      { ...writer("bad", {}), writes: { field: 42 as unknown as string } },
      writer("nested", { summary: "/summary/items/0" }),
    ];
    const producers = stateFieldProducers(root);
    expect([...producers.keys()].sort()).toEqual(["summary", "value"]);
    expect(producers.get("value")).toEqual(["whole-output"]);
    expect(producers.get("summary")).toEqual(["nested"]);
  });

  it("ignores an invalid node list instead of throwing", () => {
    const broken = { ...emptyDefinition(), nodes: undefined } as unknown as WorkflowDefinitionV2;
    expect(stateFieldProducers(broken).size).toBe(0);
  });
});

describe("stateFieldConsumers", () => {
  function graph(): WorkflowDefinitionV2 {
    const child = emptyDefinition();
    child.nodes = [
      { ...node("child", "core.transform"), inputs: { value: stateBinding("/childField") } },
    ];
    const root = emptyDefinition();
    root.nodes = [
      { ...node("reader", "core.transform"), inputs: { query: stateBinding("/question"), text: literal("fixed") } },
      { ...node("environment-reader", "core.transform"), inputs: { value: environmentBinding("/TOKEN") } },
      router("route", { op: "and", children: [
        { op: "nonEmpty", source: "state", pointer: "/pendingCalls" },
        { op: "eq", left: stateBinding("/approved"), right: literal(true) },
      ] }),
      subgraphNode("sub", child),
    ];
    root.outputBindings = { answer: stateBinding("/answer") };
    return root;
  }

  it("collects node inputs, nested router predicates, outputs and subgraph bindings", () => {
    const consumers = stateFieldConsumers(graph());
    expect([...consumers.keys()].sort()).toEqual(["answer", "approved", "childField", "pendingCalls", "question"]);
    expect(consumers.get("question")).toEqual(["reader"]);
    expect(consumers.get("pendingCalls")).toEqual(["route"]);
    expect(consumers.get("approved")).toEqual(["route"]);
    expect(consumers.get("answer")).toEqual([GRAPH_OUTPUT_NODE_ID]);
    expect(consumers.get("childField")).toEqual(["child"]);
    expect(consumers.has("TOKEN")).toBe(false);
  });

  it("returns an empty map for an empty definition", () => {
    expect(stateFieldConsumers(emptyDefinition()).size).toBe(0);
  });

  it("deduplicates repeated reads by the same node and skips malformed predicates", () => {
    const root = emptyDefinition();
    root.nodes = [
      { ...node("reader", "core.transform"), inputs: { a: stateBinding("/shared"), b: stateBinding("/shared") } },
      router("route", { op: "eq", left: stateBinding("/shared"), right: literal(1) }),
      node("broken-router", "core.router", { cases: [null, "text", { id: "case" }] as unknown as JsonValue }),
    ];
    const consumers = stateFieldConsumers(root);
    expect(consumers.get("shared")).toEqual(["reader", "route"]);
  });

  it("ignores a malformed outputBindings map", () => {
    const broken = { ...emptyDefinition(), outputBindings: { answer: null } } as unknown as WorkflowDefinitionV2;
    expect(stateFieldConsumers(broken).size).toBe(0);
  });
});

describe("variableReferences", () => {
  function graph(): WorkflowDefinitionV2 {
    const child = emptyDefinition();
    child.nodes = [
      { ...node("child-tool", "core.tool"), inputs: { region: environmentBinding("/CHILD_REGION") } },
    ];
    const root = emptyDefinition();
    root.nodes = [
      { ...node("model", "core.llm"), inputs: { baseUrl: environmentBinding("/API_BASE_URL"), retries: literal(2) } },
      router("route", { op: "eq", left: environmentBinding("/MODE"), right: literal("fast") }),
      { ...node("environment-reader", "core.transform"), inputs: { mode: environmentBinding("/MODE") } },
      subgraphNode("sub", child),
    ];
    root.outputBindings = { result: environmentBinding("/OUTPUT_VARIABLE") };
    return root;
  }

  it("reports environment bindings from inputs, predicates, outputs and subgraphs", () => {
    expect(variableReferences(graph())).toEqual([
      { key: "API_BASE_URL", nodeId: "model", graphPath: [] },
      { key: "MODE", nodeId: "route", graphPath: [] },
      { key: "MODE", nodeId: "environment-reader", graphPath: [] },
      { key: "OUTPUT_VARIABLE", nodeId: GRAPH_OUTPUT_NODE_ID, graphPath: [] },
      { key: "CHILD_REGION", nodeId: "child-tool", graphPath: ["sub"] },
    ]);
  });

  it("returns an empty list for an empty definition", () => {
    expect(variableReferences(emptyDefinition())).toEqual([]);
  });

  it("deduplicates the same variable read twice by one node", () => {
    const root = emptyDefinition();
    root.nodes = [{ ...node("model", "core.transform"), inputs: { a: environmentBinding("/KEY"), b: environmentBinding("/KEY") } }];
    expect(variableReferences(root)).toEqual([{ key: "KEY", nodeId: "model", graphPath: [] }]);
  });

  it("skips a binding that reads the whole environment object", () => {
    const root = emptyDefinition();
    root.nodes = [{ ...node("model", "core.transform"), inputs: { all: environmentBinding("") } }];
    expect(variableReferences(root)).toEqual([]);
  });
});

describe("pointerFieldName", () => {
  it("decodes the first segment of a JSON Pointer", () => {
    expect(pointerFieldName("/messages")).toBe("messages");
    expect(pointerFieldName("/messages/0/content")).toBe("messages");
    expect(pointerFieldName("/a~1b~0c")).toBe("a/b~c");
    expect(pointerFieldName("plain")).toBe("plain");
    expect(pointerFieldName("")).toBeUndefined();
    expect(pointerFieldName("/")).toBeUndefined();
    expect(pointerFieldName(undefined)).toBeUndefined();
  });
});

describe("defaultParamName", () => {
  it("returns value for literal bindings regardless of taken names", () => {
    expect(defaultParamName(literal(1), new Set())).toBe("value");
    expect(defaultParamName(literal(1), new Set(["value"]))).toBe("value");
  });

  it("uses the last pointer segment and removes array markers", () => {
    expect(defaultParamName(stateBinding("/messages"), new Set())).toBe("messages");
    expect(defaultParamName(stateBinding("/items[]"), new Set())).toBe("items");
    expect(defaultParamName(stateBinding("/messages/0/content"), new Set())).toBe("content");
    expect(defaultParamName(environmentBinding("/API_BASE_URL"), new Set())).toBe("API_BASE_URL");
  });

  it("decodes escapes and replaces invalid characters with underscores", () => {
    expect(defaultParamName(stateBinding("/a~1b"), new Set())).toBe("a_b");
    expect(defaultParamName(stateBinding("/user-name"), new Set())).toBe("user_name");
    expect(defaultParamName(stateBinding("/0"), new Set())).toBe("_0");
  });

  it("falls back to value for an empty pointer", () => {
    expect(defaultParamName(stateBinding(""), new Set())).toBe("value");
    expect(defaultParamName(stateBinding(""), new Set(["value"]))).toBe("value_2");
  });

  it("adds numeric suffixes on conflicts without mutating the taken set", () => {
    const taken = new Set(["messages", "messages_2"]);
    expect(defaultParamName(stateBinding("/messages"), taken)).toBe("messages_3");
    expect([...taken]).toEqual(["messages", "messages_2"]);
  });

  it("avoids the reserved history name", () => {
    expect(defaultParamName(stateBinding("/history"), new Set())).toBe("history_2");
  });

  it("keeps the generated name within the parameter-name grammar", () => {
    const name = defaultParamName(stateBinding(`/${"x".repeat(100)}`), new Set());
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
  });
});
