import { describe, expect, it } from "vitest";
import type { WorkflowReferenceBlock, WorkflowReferenceItem } from "../domain/v2/types";
import { directCallerGroups, groupReferenceItems, indirectReferenceBlocks, isDirectReference, referencePathLabel, referenceTargetStatus, referencedByCounts, relationSummaryText, targetDisplayName } from "./workflowRelations";

const target = (revision: number, currentRevision: number, available = true, reason?: "missing" | "archived") => ({
  workflowId: "target", revision, currentRevision, name: "目标", available, ...(reason ? { reason } : {}), environmentRef: "local",
});
const item = (nodeId: string, revision: number): WorkflowReferenceItem => ({
  graphPath: [], nodeId, nodeLabel: `节点 ${nodeId}`,
  inputs: { question: { source: "literal", value: "hi" } }, writes: { answer: "/answer" },
  target: target(revision, 3),
});
const block = (sourceWorkflowId: string, nodeId: string, options: { sourceCurrent?: boolean; chain?: string[]; rootWorkflowId?: string } = {}): WorkflowReferenceBlock => ({
  rootWorkflowId: options.rootWorkflowId ?? sourceWorkflowId,
  rootRevision: 1,
  rootName: sourceWorkflowId,
  sourceWorkflowId,
  sourceRevision: 1,
  sourceName: sourceWorkflowId,
  sourceCurrent: options.sourceCurrent ?? true,
  nodeId,
  graphPath: [],
  targetWorkflowId: "target",
  targetRevision: 1,
  targetName: "目标",
  chain: options.chain ?? [sourceWorkflowId, "target"],
  chainNames: options.chain ?? [sourceWorkflowId, "目标"],
});

describe("Works relationship presentation", () => {
  it("counts different Workflows, not repeated call nodes", () => {
    const blocks = [block("A", "a1"), block("A", "a2"), block("B", "b1")];
    expect(directCallerGroups(blocks)).toHaveLength(2);
    expect(directCallerGroups(blocks)[0].items).toHaveLength(2);
    expect(referencedByCounts(blocks)).toEqual({ directWorkflows: 2, directCallSites: 3, indirectRoots: 0, indirectCallSites: 0 });
  });

  it("keeps direct current references separate from old fixed-revision protection chains", () => {
    const direct = block("A", "a1");
    const indirect = block("B", "b1", { rootWorkflowId: "B", chain: ["B", "middle@1", "target"] });
    expect(isDirectReference(direct)).toBe(true);
    expect(isDirectReference(indirect)).toBe(false);
    expect(indirectReferenceBlocks([direct, indirect])).toEqual([indirect]);
    expect(referencedByCounts([direct, indirect])).toEqual({ directWorkflows: 1, directCallSites: 1, indirectRoots: 1, indirectCallSites: 1 });
  });

  it("keeps an all-current multi-hop chain indirect without assuming an old revision", () => {
    const allCurrent = block("A", "a1", { chain: ["A@1", "T@1", "leaf@1"] });
    expect(allCurrent.sourceCurrent).toBe(true);
    expect(isDirectReference(allCurrent)).toBe(false);
    expect(indirectReferenceBlocks([allCurrent])).toEqual([allCurrent]);
    expect(referencedByCounts([allCurrent])).toEqual({ directWorkflows: 0, directCallSites: 0, indirectRoots: 1, indirectCallSites: 1 });
  });

  it("groups repeat target nodes into one Workflow group", () => {
    const groups = groupReferenceItems([item("one", 2), item("two", 2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(targetDisplayName(groups[0].items[0].target)).toBe("目标");
  });

  it("keeps the pinned revision visible instead of substituting the current head", () => {
    expect(referenceTargetStatus(target(2, 3))).toEqual({ label: "固定版本 2 · 目标当前版本 3", tone: "quiet", openable: true });
    expect(referenceTargetStatus(target(3, 3))).toEqual({ label: "固定版本 3 · 当前版本", tone: "ok", openable: true });
  });

  it("shows unavailable archived and missing states without offering an open action", () => {
    expect(referenceTargetStatus(target(2, 3, false, "archived"))).toEqual({ label: "固定版本 2 · 目标已归档", tone: "warn", openable: false });
    expect(referenceTargetStatus(target(2, 3, false, "missing"))).toEqual({ label: "固定版本 2 · 版本不可用", tone: "warn", openable: false });
    expect(targetDisplayName({ workflowId: "x", name: undefined })).toBe("目标工作流不可用");
  });

  it("labels counts as different Workflows and keeps paths scoped", () => {
    expect(relationSummaryText({ referenceWorkflows: 1, referencedByWorkflows: 2 })).toBe("引用 1 个工作流 · 被 2 个工作流引用");
    expect(relationSummaryText(undefined)).toBe("查看引用关系");
    expect(referencePathLabel([])).toBe("根图");
    expect(referencePathLabel(["team_graph", "sub"])).toBe("内嵌路径 team_graph / sub");
  });
});
