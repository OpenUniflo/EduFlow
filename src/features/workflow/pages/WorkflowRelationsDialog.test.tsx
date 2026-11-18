// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowReferenceBlock, WorkflowReferenceItem, WorkflowSummaryV2 } from "../domain/v2/types";

const api = vi.hoisted(() => ({ references: vi.fn(), referencedBy: vi.fn() }));
vi.mock("../application/v2/useWorkflowV2Controller", () => ({ workflowApiV2: api }));

import { WorkflowRelationsDialog } from "./WorkflowRelationsDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const dialogProto = window.HTMLDialogElement?.prototype;
if (dialogProto) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  dialogProto.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
}

const parentItem: WorkflowSummaryV2 = { workflowId: "source-a", revision: 1, name: "验收父流程 A", description: "" };
const leafItem: WorkflowSummaryV2 = { workflowId: "leaf-l", revision: 1, name: "验收叶子流程", description: "" };
const targetItem: WorkflowSummaryV2 = { workflowId: "target-t", revision: 1, name: "验收被引用目标", description: "" };
const noop = () => undefined;
const target = (environmentRef: string) => ({ workflowId: "target-t", revision: 1, currentRevision: 1, name: "验收被引用目标", available: true, environmentRef });
const outgoingReference = (nodeId: string, graphPath: string[], environmentRef: string): WorkflowReferenceItem => ({
  graphPath, nodeId, nodeLabel: nodeId,
  inputs: {}, writes: {}, target: target(environmentRef),
});

function caller(sourceWorkflowId: string, sourceName: string, nodeId: string): WorkflowReferenceBlock {
  return {
    rootWorkflowId: sourceWorkflowId, rootRevision: 1, rootName: sourceName,
    sourceWorkflowId, sourceRevision: 1, sourceName, sourceCurrent: true,
    nodeId, graphPath: [], targetWorkflowId: "target-t", targetRevision: 1, targetName: "验收被引用目标",
    chain: [`${sourceWorkflowId}:1`, "target-t:1"], chainNames: [sourceName, "验收被引用目标"],
  };
}

const directLeaf: WorkflowReferenceBlock = {
  rootWorkflowId: "target-t", rootRevision: 1, rootName: "验收被引用目标",
  sourceWorkflowId: "target-t", sourceRevision: 1, sourceName: "验收被引用目标", sourceCurrent: true,
  nodeId: "call_leaf", graphPath: [], targetWorkflowId: "leaf-l", targetRevision: 1, targetName: "验收叶子流程",
  chain: ["target-t:1", "leaf-l:1"], chainNames: ["验收被引用目标", "验收叶子流程"],
};

function indirectLeaf(rootWorkflowId: string, rootName: string, sourceCurrent: boolean, chain: string[], chainNames: string[], nodeId: string): WorkflowReferenceBlock {
  return {
    rootWorkflowId, rootRevision: 1, rootName,
    sourceWorkflowId: "target-t", sourceRevision: 1, sourceName: "验收被引用目标", sourceCurrent,
    nodeId, graphPath: [], targetWorkflowId: "leaf-l", targetRevision: 1, targetName: "验收叶子流程",
    chain, chainNames,
  };
}

const oldSource: WorkflowReferenceBlock = {
  rootWorkflowId: "source-d", rootRevision: 1, rootName: "验收间接根流程",
  sourceWorkflowId: "middle-m", sourceRevision: 1, sourceName: "验收中间流程", sourceCurrent: false,
  nodeId: "call_target", graphPath: [], targetWorkflowId: "target-t", targetRevision: 1, targetName: "验收被引用目标",
  chain: ["source-d:1", "middle-m:1", "target-t:1"], chainNames: ["验收间接根流程", "验收中间流程", "验收被引用目标"],
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api.references.mockReset().mockResolvedValue({ workflowId: parentItem.workflowId, revision: parentItem.revision, items: [] });
  api.referencedBy.mockReset().mockResolvedValue({ workflowId: parentItem.workflowId, mode: "current-closure", items: [] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(workflow: WorkflowSummaryV2 = parentItem) {
  await act(async () => {
    root.render(<WorkflowRelationsDialog item={workflow} onClose={noop} onOpenWorkflow={noop} />);
  });
  await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
  return container;
}

describe("WorkflowRelationsDialog", () => {
  it("shows each outgoing call site's own target environment while counting one Workflow", async () => {
    api.references.mockResolvedValue({
      workflowId: parentItem.workflowId, revision: parentItem.revision,
      items: [outgoingReference("call_a1", [], "local"), outgoingReference("inner_call", ["group"], "local-alt")],
    });

    await render();

    const outgoing = container.querySelectorAll(".wf-relations-section").item(0);
    expect(outgoing.textContent).toContain("1 个工作流 · 2 个调用处");
    expect(outgoing.querySelectorAll(".wf-relations-target")).toHaveLength(1);
    expect([...container.querySelectorAll(".wf-relations-meta")].map(element => element.textContent)).toEqual([
      "运行环境 local",
      "运行环境 local-alt",
    ]);
  });

  it("labels all-current multi-hop incoming chains neutrally and does not infer old revisions from the last source", async () => {
    api.referencedBy.mockResolvedValue({
      workflowId: leafItem.workflowId, mode: "current-closure",
      items: [
        directLeaf,
        indirectLeaf("source-a", "验收父流程 A", true, ["source-a:1", "target-t:1", "leaf-l:1"], ["验收父流程 A", "验收被引用目标", "验收叶子流程"], "call_a"),
        indirectLeaf("source-b", "验收父流程 B", true, ["source-b:1", "target-t:1", "leaf-l:1"], ["验收父流程 B", "验收被引用目标", "验收叶子流程"], "call_b"),
        // The old revision is an intermediate layer; sourceCurrent only describes
        // the last source, so the UI must not claim the whole chain is non-current.
        indirectLeaf("source-d", "验收间接根流程", true, ["source-d:1", "middle-m:1", "target-t:1", "leaf-l:1"], ["验收间接根流程", "验收中间流程", "验收被引用目标", "验收叶子流程"], "call_leaf"),
      ],
    });

    await render(leafItem);

    const incoming = container.querySelectorAll(".wf-relations-section").item(1);
    expect(incoming.textContent).toContain("1 个工作流直接引用 · 1 个调用处 · 另有 3 个作品存在间接依赖");
    expect(incoming.textContent).not.toContain("旧固定版本");
    expect(incoming.textContent).not.toContain("间接保护");
    const indirect = incoming.querySelector(".wf-relations-indirect");
    expect(indirect?.textContent).toContain("经其他工作流的间接依赖");
    expect(indirect?.textContent).toContain("验收父流程 A → 验收被引用目标 → 验收叶子流程");
    expect(indirect?.textContent).toContain("验收父流程 B → 验收被引用目标 → 验收叶子流程");
    expect(indirect?.textContent).toContain("验收间接根流程 → 验收中间流程 → 验收被引用目标 → 验收叶子流程");
    expect(indirect?.textContent).toContain("固定此作品版本 1");
    expect(indirect?.textContent).not.toContain("已不是当前版本");
    expect(indirect?.querySelectorAll(".wf-relations-target")).toHaveLength(3);
  });

  it("marks the last source revision as non-current only when the API provides that evidence", async () => {
    api.referencedBy.mockResolvedValue({
      workflowId: targetItem.workflowId, mode: "current-closure",
      items: [caller("source-a", "验收父流程 A", "call_a1"), caller("source-a", "验收父流程 A", "inner_call"), caller("source-b", "验收父流程 B", "call_b"), oldSource],
    });

    await render(targetItem);

    const incoming = container.querySelectorAll(".wf-relations-section").item(1);
    expect(incoming.textContent).toContain("2 个工作流直接引用 · 3 个调用处 · 另有 1 个作品存在间接依赖");
    const indirect = incoming.querySelector(".wf-relations-indirect");
    expect(indirect?.textContent).toContain("验收间接根流程 → 验收中间流程 → 验收被引用目标");
    expect(indirect?.textContent).toContain("固定此作品版本 1");
    expect(indirect?.textContent).toContain("最后来源修订 1 已不是当前版本");
  });
});
