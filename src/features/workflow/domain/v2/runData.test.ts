import { describe, expect, it } from "vitest";
import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";
import { nodeRunData, type RunStepInput } from "./runData";

const policy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };

function emptyDefinition(): WorkflowDefinitionV2 {
  return {
    schemaVersion: "2.0", workflowId: "workflow", revision: 1, name: "test", description: "",
    inputSchema: { type: "object" }, outputSchema: { type: "object" },
    state: { schema: { type: "object" }, initial: {}, inputBindings: {}, reducers: {} },
    entryNodeId: "start", nodes: [], transitions: [], outputBindings: {}, policy, requiredCapabilities: [],
  };
}

function node(id: string, type: string, writes: Record<string, string> = {}): WorkflowNodeV2 {
  return { id, label: id, type, typeVersion: 1, config: {}, inputs: {}, writes };
}

function step(overrides: Partial<RunStepInput> & Pick<RunStepInput, "stepId" | "nodeId">): RunStepInput {
  return { runId: "run-1", status: "completed", ...overrides };
}

describe("nodeRunData", () => {
  function definition(): WorkflowDefinitionV2 {
    const root = emptyDefinition();
    root.state.reducers = {
      messages: { name: "messages", version: 1 },
      toolCalls: { name: "append", version: 1 },
      answer: { name: "replace", version: 1 },
    };
    root.nodes = [node("model", "core.llm", { messages: "/messages", pendingCalls: "/toolCalls", text: "/answer" })];
    return root;
  }

  it("returns the step output, inferred writes, reducers and elapsed time", () => {
    const data = nodeRunData(definition(), [step({
      stepId: "step-1", nodeId: "model", status: "completed",
      input: { query: "hello" },
      output: { messages: [{ role: "assistant" }], pendingCalls: [], text: "hi" } as unknown as JsonValue,
      startedAt: "2026-10-23T01:00:00.000Z",
      finishedAt: "2026-10-23T01:00:01.250Z",
    })], "model");
    expect(data).toEqual({
      runId: "run-1", stepId: "step-1", status: "completed",
      input: { query: "hello" },
      output: { messages: [{ role: "assistant" }], pendingCalls: [], text: "hi" },
      writes: [
        { field: "messages", pointer: "/messages", value: [{ role: "assistant" }], reducer: "messages" },
        { field: "toolCalls", pointer: "/toolCalls", value: [], reducer: "append" },
        { field: "answer", pointer: "/answer", value: "hi", reducer: "replace" },
      ],
      elapsedMs: 1250,
      stepIndex: 0,
      invocationCount: 1,
    });
  });

  it("takes the last invocation when a loop ran the node repeatedly", () => {
    const steps = [
      step({ stepId: "s1", nodeId: "model", status: "completed", output: { text: "first" } as unknown as JsonValue }),
      step({ stepId: "s2", nodeId: "other", status: "completed", output: { text: "other" } as unknown as JsonValue }),
      step({ stepId: "s3", nodeId: "model", status: "completed", output: { text: "second" } as unknown as JsonValue }),
      step({ stepId: "s4", nodeId: "model", status: "failed", output: { text: "third" } as unknown as JsonValue }),
    ];
    const data = nodeRunData(definition(), steps, "model");
    expect(data?.stepId).toBe("s4");
    expect(data?.status).toBe("failed");
    expect(data?.stepIndex).toBe(3);
    expect(data?.invocationCount).toBe(3);
    expect(data?.writes.find(write => write.field === "answer")?.value).toBe("third");
  });

  it("returns null for an empty definition, an unknown node or a node with no matching step", () => {
    expect(nodeRunData(emptyDefinition(), [step({ stepId: "s1", nodeId: "model" })], "model")).toBeNull();
    expect(nodeRunData(definition(), [step({ stepId: "s1", nodeId: "model" })], "missing")).toBeNull();
    expect(nodeRunData(definition(), [step({ stepId: "s1", nodeId: "other" })], "model")).toBeNull();
    expect(nodeRunData(definition(), [], "model")).toBeNull();
  });

  it("separates root and subgraph steps that share a node id", () => {
    const child = emptyDefinition();
    child.state.reducers = { answer: { name: "replace", version: 1 } };
    child.nodes = [node("model", "core.llm", { text: "/answer" })];
    const root = definition();
    root.nodes.push({ id: "sub", label: "sub", type: "core.subgraph", typeVersion: 1, config: { graph: child as unknown as JsonValue }, inputs: {}, writes: {} });
    const steps = [
      step({ stepId: "root", nodeId: "model", output: { text: "root" } as unknown as JsonValue }),
      step({ stepId: "child", nodeId: "model", graphPath: ["sub"], output: { text: "child" } as unknown as JsonValue }),
    ];
    expect(nodeRunData(root, steps, "model")?.stepId).toBe("root");
    expect(nodeRunData(root, steps, "model", ["sub"])?.writes[0]).toEqual({ field: "answer", pointer: "/answer", value: "child", reducer: "replace" });
    expect(nodeRunData(root, steps, "model", ["missing"])).toBeNull();
  });

  it("returns null when the subgraph path does not resolve to a graph", () => {
    const root = definition();
    root.nodes.push({ id: "sub", label: "sub", type: "core.subgraph", typeVersion: 1, config: { graph: { nodes: "bad" } as unknown as JsonValue }, inputs: {}, writes: {} });
    expect(nodeRunData(root, [step({ stepId: "s1", nodeId: "model", graphPath: ["sub"] })], "model", ["sub"])).toBeNull();
  });

  it("tolerates missing outputs, unknown reducers, empty pointers and malformed dates", () => {
    const root = emptyDefinition();
    root.nodes = [{ ...node("model", "core.llm", { answer: "/answer", broken: "" }), writes: { answer: "/answer", broken: "" } }];
    const data = nodeRunData(root, [step({
      stepId: "s1", nodeId: "model", status: "completed",
      output: { other: 1 } as unknown as JsonValue,
      startedAt: "not-a-date", finishedAt: "also-not",
    })], "model");
    expect(data?.elapsedMs).toBeUndefined();
    expect(data?.writes).toEqual([{ field: "answer", pointer: "/answer", value: undefined, reducer: "replace" }]);
  });

  it("skips malformed step entries and treats a missing graphPath as the root scope", () => {
    const steps = [
      null as unknown as RunStepInput,
      { runId: "run-1", status: "completed", stepId: "s1", nodeId: "model" } as RunStepInput,
    ];
    expect(nodeRunData(definition(), steps, "model")?.stepId).toBe("s1");
    expect(nodeRunData(definition(), steps, "model", [])?.stepId).toBe("s1");
  });

  it("returns null when the definition or steps argument is malformed", () => {
    expect(nodeRunData(null as unknown as WorkflowDefinitionV2, [], "model")).toBeNull();
    expect(nodeRunData({ ...emptyDefinition(), nodes: undefined } as unknown as WorkflowDefinitionV2, [], "model")).toBeNull();
    expect(nodeRunData(definition(), null as unknown as RunStepInput[], "model")).toBeNull();
  });
});
