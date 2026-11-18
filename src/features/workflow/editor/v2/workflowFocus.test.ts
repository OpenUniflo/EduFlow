import { describe, expect, it } from "vitest";
import { resolveWorkflowFocus } from "./workflowFocus";
import type { WorkflowDefinitionV2 } from "../../domain/v2/types";
import { createWorkflowV2 } from "../../domain/v2/factory";

const definition = {
  schemaVersion: "2.0", workflowId: "root", revision: 1, name: "root", description: "",
  inputSchema: { type: "object", properties: {} }, outputSchema: { type: "object", properties: {} },
  state: { schema: { type: "object", properties: {} }, initial: {}, inputBindings: {}, reducers: {} },
  entryNodeId: "start", policy: { timeoutMs: 1, nodeTimeoutMs: 1, maxNodeExecutions: 1, maxToolCalls: 1, maxInputBytes: 1, maxStateBytes: 1, maxEventBytes: 1, maxOutputTokens: 1, maxAttempts: 1 },
  requiredCapabilities: [], outputBindings: {},
  nodes: [
    { id: "start", label: "开始", type: "core.start", typeVersion: 1, config: {}, inputs: {}, writes: {} },
    { id: "embedded", label: "内嵌", type: "core.subgraph", typeVersion: 1, config: { graph: { ...createWorkflowV2("内部"), workflowId: "inner", revision: 1 } }, inputs: {}, writes: {} },
  ],
  transitions: [],
} as unknown as WorkflowDefinitionV2;

describe("Works relationship node focus", () => {
  it("selects a real root node", () => {
    expect(resolveWorkflowFocus(definition, { nodeId: "start", graphPath: [] })).toEqual({ nodeId: "start", graphPath: [] });
  });

  it("selects a node inside an embedded graph path", () => {
    expect(resolveWorkflowFocus(definition, { nodeId: "start", graphPath: ["embedded"] })).toEqual({ nodeId: "start", graphPath: ["embedded"] });
  });

  it("drops a stale node or path instead of failing the editor", () => {
    expect(resolveWorkflowFocus(definition, { nodeId: "removed", graphPath: [] })).toBeUndefined();
    expect(resolveWorkflowFocus(definition, { nodeId: "start", graphPath: ["missing"] })).toBeUndefined();
    expect(resolveWorkflowFocus(definition, { nodeId: "start", graphPath: ["x", "y"] })).toBeUndefined();
  });
});
