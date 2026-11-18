import { describe, expect, it } from "vitest";
import { createNodeV2, createWorkflowV2 } from "./factory";
import type { WorkflowDefinitionV2 } from "./types";
import { definitionHasFixedReferences, expandRunDefinition, runReferenceCalls, runReferenceKey, type RunReferenceSnapshot } from "./runReferences";

function referenceNode(id: string, workflowId: string, revision: number) {
  return { ...createNodeV2("core.subgraph", id), label: id, config: { workflowRef: { workflowId, revision }, environmentRef: "local" } };
}

function target(workflowId: string, revision: number, value: string): WorkflowDefinitionV2 {
  const definition = createWorkflowV2(workflowId);
  definition.workflowId = workflowId; definition.revision = revision;
  definition.nodes.push({ ...createNodeV2("core.transform", "emit"), label: `emit-${value}`, inputs: { value: { source: "literal", value } } });
  return definition;
}

function snapshot(targets: { workflowId: string; revision: number; value: string }[]): RunReferenceSnapshot {
  return {
    available: true, version: 1, root: { workflowId: "root", revision: 1 }, rootEnvironmentRef: "local",
    targets: targets.map(item => ({ workflowId: item.workflowId, revision: item.revision, environmentRef: "local", name: item.workflowId, definition: target(item.workflowId, item.revision, item.value) })),
    environments: [{ environmentRef: "local", environmentRevision: "env-1" }], targetCount: targets.length,
  };
}

describe("frozen Run reference closure", () => {
  it("expands only the exact frozen revision, including a nested chain", () => {
    const root = createWorkflowV2("父流程"); root.workflowId = "root"; root.revision = 1;
    root.nodes.push(referenceNode("call", "middle", 3));
    const middle = target("middle", 3, "middle-old");
    middle.nodes.push(referenceNode("nested", "leaf", 2));
    const frozen = snapshot([{ workflowId: "middle", revision: 3, value: "middle-old" }, { workflowId: "leaf", revision: 2, value: "leaf-old" }]);
    frozen.targets[0].definition = middle;
    const expanded = expandRunDefinition(root, frozen);
    const call = expanded.nodes.find(node => node.id === "call");
    expect((call?.config.graph as WorkflowDefinitionV2).workflowId).toBe("middle");
    const middleDefinition = call?.config.graph as WorkflowDefinitionV2;
    const nested = middleDefinition.nodes.find(node => node.id === "nested");
    expect((nested?.config.graph as WorkflowDefinitionV2).revision).toBe(2);
    expect(JSON.stringify(expanded)).toContain("leaf-old");
    expect(JSON.stringify(expanded)).not.toContain("latest");
  });

  it("keeps a missing target as an explicit gap and never invents a definition", () => {
    const root = createWorkflowV2("父流程"); root.workflowId = "root"; root.revision = 1;
    root.nodes.push(referenceNode("call", "missing", 1));
    const expanded = expandRunDefinition(root, { available: true, version: 1, root: { workflowId: "root", revision: 1 }, rootEnvironmentRef: "local", targets: [], environments: [], targetCount: 0 });
    const call = expanded.nodes.find(node => node.id === "call");
    expect(call?.config.graph).toBeUndefined();
    expect(definitionHasFixedReferences(expanded)).toBe(true);
    expect(runReferenceCalls(expanded, null)).toEqual([]);
  });

  it("indexes by workflow + exact revision + environment", () => {
    const frozen = snapshot([{ workflowId: "child", revision: 2, value: "v2" }]);
    expect(frozen.targets[0]).toBeTruthy();
    expect(runReferenceKey("child", 2, "local")).not.toBe(runReferenceKey("child", 1, "local"));
    expect(runReferenceKey("child", 2, "local")).not.toBe(runReferenceKey("child", 2, "local-alt"));
  });

  it("does not mutate the input definition", () => {
    const root = createWorkflowV2("父流程"); root.workflowId = "root"; root.revision = 1;
    root.nodes.push(referenceNode("call", "child", 1));
    const before = JSON.stringify(root);
    expandRunDefinition(root, snapshot([{ workflowId: "child", revision: 1, value: "v1" }]));
    expect(JSON.stringify(root)).toBe(before);
  });
});
