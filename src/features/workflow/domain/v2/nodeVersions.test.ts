import { describe, expect, it } from "vitest";
import type { WorkflowNodeV2 } from "./types";
import { currentNodeTypeVersion, CURRENT_TYPE_VERSIONS, isRetiredNode, RETIRED_TYPE_VERSION } from "./nodeVersions";

function node(type: string, typeVersion: number): WorkflowNodeV2 {
  return { id: `node-${type}`, label: type, type, typeVersion, config: {}, inputs: {}, writes: {} };
}

describe("CURRENT_TYPE_VERSIONS", () => {
  it("requires version 2 for model and tool nodes and version 1 for everything else", () => {
    expect(CURRENT_TYPE_VERSIONS["core.llm"]).toBe(2);
    expect(CURRENT_TYPE_VERSIONS["core.tool"]).toBe(2);
    expect(currentNodeTypeVersion("core.transform")).toBe(1);
    expect(currentNodeTypeVersion("core.function")).toBe(1);
    expect(currentNodeTypeVersion("unknown.type")).toBe(1);
  });

  it("is frozen so callers cannot mutate the registry", () => {
    expect(Object.isFrozen(CURRENT_TYPE_VERSIONS)).toBe(true);
  });
});

describe("isRetiredNode", () => {
  it("reports the old model and tool contracts", () => {
    expect(isRetiredNode(node("core.llm", RETIRED_TYPE_VERSION))).toBe(true);
    expect(isRetiredNode(node("core.tool", RETIRED_TYPE_VERSION))).toBe(true);
  });

  it("accepts the current and future type versions", () => {
    expect(isRetiredNode(node("core.llm", 2))).toBe(false);
    expect(isRetiredNode(node("core.tool", 2))).toBe(false);
    expect(isRetiredNode(node("core.llm", 3))).toBe(false);
  });

  it("ignores node types that are not retiring", () => {
    expect(isRetiredNode(node("core.transform", 1))).toBe(false);
    expect(isRetiredNode(node("control.fork", 1))).toBe(false);
    expect(isRetiredNode(node("unknown.type", 1))).toBe(false);
  });

  it("does not report missing, empty or malformed nodes", () => {
    expect(isRetiredNode(null)).toBe(false);
    expect(isRetiredNode(undefined)).toBe(false);
    expect(isRetiredNode({ type: "core.llm" } as unknown as Pick<WorkflowNodeV2, "type" | "typeVersion">)).toBe(false);
    expect(isRetiredNode({ type: "core.llm", typeVersion: Number.NaN })).toBe(false);
    expect(isRetiredNode({ type: "core.llm", typeVersion: null } as unknown as Pick<WorkflowNodeV2, "type" | "typeVersion">)).toBe(false);
    expect(isRetiredNode({ type: 42, typeVersion: 1 } as unknown as Pick<WorkflowNodeV2, "type" | "typeVersion">)).toBe(false);
  });
});
